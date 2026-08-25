import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { resolveProviderUser } from '@/lib/ledger'
import { toDec } from '@/lib/money'
import { notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/**
 * POST /api/itineraries/[id]/book
 *
 * Book an entire itinerary in a single transaction. Creates a Booking for
 * each ItineraryItem, processes a single payment, and creates ledger entries.
 *
 * If ANY booking fails (e.g., slot already taken), the entire transaction
 * rolls back and the payment is refunded.
 *
 * Affiliate attribution is applied to the first booking (typically the Doctor).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const { id } = await params

    // Fetch itinerary with items
    const itinerary = await db.itinerary.findUnique({
      where: { id },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    })

    if (!itinerary) return error(404, 'Itinerary not found')
    if (itinerary.patientId !== session.id) return error(403, 'Forbidden')
    if (itinerary.status !== 'DRAFT') return error(409, `Itinerary is ${itinerary.status}. Only DRAFT itineraries can be booked.`)
    if (itinerary.items.length === 0) return error(400, 'Itinerary has no items')

    // === Server-side price re-derivation ===
    // The patient-set estimate (totalEstimatedCost / item.estimatedCost) is
    // NEVER charged. Every item is re-priced from current DB state; services
    // must belong to their provider and be active.
    interface PricedItem { itemId: string; amountDollars: string; providerUserId: string | null }
    const pricedItems: PricedItem[] = []
    let totalPrice = 0
    for (const item of itinerary.items) {
      let providerUserId: string | null = null
      let basePrice = '0'
      if (item.providerType === 'DOCTOR') {
        const p = await db.doctor.findUnique({ where: { id: item.providerId } })
        if (!p || !p.verified) return error(409, 'A doctor in this itinerary is no longer available')
        providerUserId = p.userId; basePrice = p.consultationFee
      } else if (item.providerType === 'HOSPITAL') {
        const p = await db.hospital.findUnique({ where: { id: item.providerId } })
        if (!p || !p.verified) return error(409, 'A hospital in this itinerary is no longer available')
        providerUserId = p.userId; basePrice = p.baseFee
      } else if (item.providerType === 'HOTEL') {
        const p = await db.hotel.findUnique({ where: { id: item.providerId } })
        if (!p || !p.verified) return error(409, 'A hotel in this itinerary is no longer available')
        providerUserId = p.userId; basePrice = p.pricePerNight
      } else if (item.providerType === 'TRANSLATOR') {
        const p = await db.translator.findUnique({ where: { id: item.providerId } })
        if (!p || !p.verified) return error(409, 'A translator in this itinerary is no longer available')
        providerUserId = p.userId; basePrice = p.hourlyRate
      } else {
        return error(400, 'Unknown provider type in itinerary')
      }
      let price = parseFloat(basePrice || '0')
      if (item.serviceId) {
        const svcOwnership =
          item.providerType === 'DOCTOR' ? { doctorId: item.providerId }
          : item.providerType === 'HOSPITAL' ? { hospitalId: item.providerId }
          : item.providerType === 'HOTEL' ? { hotelId: item.providerId }
          : { translatorId: item.providerId }
        const svc = await db.service.findFirst({
          where: { id: item.serviceId, providerType: item.providerType, isActive: true, ...svcOwnership },
        })
        if (svc) price = parseFloat(svc.price)
      }
      totalPrice += price
      pricedItems.push({ itemId: item.id, amountDollars: price.toFixed(2), providerUserId })
    }

    const totalAmountCents = Math.round(totalPrice * 100)
    const totalAmountDollars = totalPrice.toFixed(2)

    // === Step 1: Payments must be commercially live — no mocks exist anymore ===
    const { arePaymentsEnabled, createCheckoutSession } = await import('@/lib/stripe')
    const paymentsLive = await arePaymentsEnabled()
    if (!paymentsLive) {
      return error(503, 'Online payments are not yet available. Please contact support.')
    }

    // Create ONE Stripe Checkout Session for the whole itinerary.
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
    const cs = await createCheckoutSession({
      bookingId: itinerary.id, // metadata carries the itinerary id
      amount: totalPrice,
      description: `Wishubest itinerary — ${itinerary.items.length} services`,
      customerEmail: session.email,
      successUrl: `${origin}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/checkout/cancelled?bookingId=${itinerary.id}`,
      metadata: { itineraryId: itinerary.id, patientId: session.id },
    })
    if (!cs) return error(503, 'Payment provider unavailable. Please contact support.')
    let stripeSessionId = cs.id
    let paymentStatus = 'PENDING'

    // === Step 2: Determine affiliate attribution (applied to first booking) ===
    let affiliateUserId: string | null = null
    let affiliateRate = '0'
    let affiliateAmount = '0'

    const REFERRAL_TTL_MS = 365 * 24 * 60 * 60 * 1000

    // Check patient referral first (priority)
    const patientUser = await db.user.findUnique({
      where: { id: session.id },
      select: { referredByAffiliateId: true },
    })

    if (patientUser?.referredByAffiliateId) {
      const patientAff = await db.affiliate.findUnique({
        where: { id: patientUser.referredByAffiliateId },
      })
      if (patientAff && patientAff.verified && patientAff.userId !== session.id) {
        affiliateUserId = patientAff.userId
      }
    }

    // === Step 3: Execute all bookings inside a transaction ===
    const createdBookingIds: string[] = []
    const ledgerEntries: any[] = []

    try {
      const result = await db.$transaction(async (tx) => {
        // Phase A: create all bookings FIRST. The Payment row has a real FK to
        // Booking.id, so it cannot be inserted with a placeholder id.
        interface CreatedBooking { id: string; isFirst: boolean; itemAmountDollars: string; platformCut: string; providerNet: string; providerUserId: string; bookingAffiliateUserId: string | null; bookingAffiliateAmount: string; affRate: string }
        const created: CreatedBooking[] = []

        for (let i = 0; i < itinerary.items.length; i++) {
          const item = itinerary.items[i]
          // Server-derived price + provider (see re-derivation above)
          const priced = pricedItems[i]!
          const itemAmountDollars = priced.amountDollars
          const providerUserId = priced.providerUserId

          if (!providerUserId) {
            throw new Error(`Provider not found for ${item.providerType} ${item.providerId}`)
          }

          // Get commission rate for this provider type
          const commissionRateRow = await tx.commissionRate.findUnique({
            where: { providerType: item.providerType },
          })
          const platformRate = commissionRateRow?.rate || '12'
          const affRate = commissionRateRow?.affiliateRate || '25'

          // Only apply affiliate to the first booking
          let bookingAffiliateUserId: string | null = null
          let bookingAffiliateAmount = '0'

          if (i === 0 && affiliateUserId) {
            bookingAffiliateUserId = affiliateUserId
            const platformCutTmp = (parseFloat(itemAmountDollars) * parseFloat(platformRate) / 100).toFixed(2)
            bookingAffiliateAmount = (parseFloat(platformCutTmp) * parseFloat(affRate) / 100).toFixed(2)
            affiliateRate = affRate
            affiliateAmount = bookingAffiliateAmount
          }

          const platformCut = (parseFloat(itemAmountDollars) * parseFloat(platformRate) / 100).toFixed(2)
          const providerNet = (parseFloat(itemAmountDollars) - parseFloat(platformCut)).toFixed(2)

          // Create the booking
          const booking = await tx.booking.create({
            data: {
              patientId: session.id,
              providerType: item.providerType,
              doctorId: item.providerType === 'DOCTOR' ? item.providerId : null,
              hospitalId: item.providerType === 'HOSPITAL' ? item.providerId : null,
              hotelId: item.providerType === 'HOTEL' ? item.providerId : null,
              translatorId: item.providerType === 'TRANSLATOR' ? item.providerId : null,
              serviceId: item.serviceId || null,
              visitType: 'ONLINE', // default — can be changed per booking later
              status: 'PENDING',
              startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // default: 1 week from now
              amount: toDec(itemAmountDollars),
              currency: 'USD',
              commissionRate: platformRate,
              commissionAmount: platformCut,
              affiliateRate: bookingAffiliateUserId ? affRate : '0',
              affiliateAmount: bookingAffiliateAmount,
              affiliateId: bookingAffiliateUserId,
              providerNetAmount: providerNet,
              itineraryId: itinerary.id,
              notes: item.notes || undefined,
            },
          })

          createdBookingIds.push(booking.id)
          created.push({ id: booking.id, isFirst: i === 0, itemAmountDollars, platformCut, providerNet, providerUserId, bookingAffiliateUserId, bookingAffiliateAmount, affRate })
        }

        // Single payment record for the entire itinerary — linked to the FIRST booking.
        const payment = await tx.payment.create({
          data: {
            bookingId: created[0].id,
            stripeSessionId,
            amount: toDec(totalAmountDollars),
            currency: 'USD',
            status: paymentStatus as any,
          },
        })

        // Phase B: build ledger entries for each booking against the single payment.
        // Only credit anyone when the money actually arrived.
        if (paymentStatus === 'SUCCEEDED') {
          for (const c of created) {
          ledgerEntries.push(
            {
              bookingId: c.id,
              paymentId: payment.id,
              userId: session.id,
              type: 'PATIENT_CHARGE',
              amount: toDec(c.itemAmountDollars),
              description: `Payment for service (itinerary)`,
            },
            {
              bookingId: c.id,
              paymentId: payment.id,
              type: 'COMMISSION',
              amount: c.platformCut,
              description: `Platform commission`,
            },
            {
              bookingId: c.id,
              paymentId: payment.id,
              userId: c.providerUserId,
              type: 'PROVIDER_CREDIT',
              amount: c.providerNet,
              description: 'Provider credit (pending until service completion)',
            }
          )

          // Affiliate commission ledger entry (only for first booking)
          if (c.isFirst && c.bookingAffiliateUserId && parseFloat(c.bookingAffiliateAmount) > 0) {
            ledgerEntries.push({
              bookingId: c.id,
              paymentId: payment.id,
              userId: c.bookingAffiliateUserId,
              type: 'AFFILIATE_COMMISSION',
              amount: c.bookingAffiliateAmount,
              description: `Affiliate commission (${c.affRate}% of platform)`,
            })

            // Update affiliate stats
            const affRec = await tx.affiliate.findUnique({ where: { userId: c.bookingAffiliateUserId } })
            if (affRec) {
              await tx.affiliate.update({
                where: { userId: c.bookingAffiliateUserId },
                data: {
                  totalBookings: { increment: 1 },
                  totalEarnings: (parseFloat(c.bookingAffiliateAmount) + parseFloat(affRec.totalEarnings || '0')).toFixed(2),
                  pendingBalance: (parseFloat(c.bookingAffiliateAmount) + parseFloat(affRec.pendingBalance || '0')).toFixed(2),
                },
              })
            }
          }
        }

          // Create all ledger entries
          if (ledgerEntries.length > 0) {
            await tx.ledgerEntry.createMany({ data: ledgerEntries })
          }
        }

        // Update itinerary status to BOOKED
        await tx.itinerary.update({
          where: { id: itinerary.id },
          data: { status: 'BOOKED' },
        })

        return { bookingIds: createdBookingIds, paymentId: payment.id }
      })

      // === Step 4: Post-transaction notifications ===
      // Notify patient
      await notify({
        userId: session.id,
        type: 'booking_created',
        title: 'Itinerary booked!',
        body: `Your medical package with ${itinerary.items.length} service(s) has been submitted. Total: $${totalAmountDollars}.`,
        link: 'bookings',
        meta: { itineraryId: itinerary.id },
      })

      // Notify each provider
      for (const bookingId of createdBookingIds) {
        const booking = await db.booking.findUnique({
          where: { id: bookingId },
          select: { doctorId: true, hospitalId: true, hotelId: true, translatorId: true, providerType: true },
        })
        if (booking) {
          const providerUserId = await resolveProviderUser(booking)
          if (providerUserId) {
            await notify({
              userId: providerUserId,
              type: 'booking_created',
              title: 'New booking received',
              body: `A patient booked a ${booking.providerType.toLowerCase()} service as part of a medical package.`,
              link: 'appointments',
              meta: { bookingId, itineraryId: itinerary.id },
            })
          }
        }
      }

      return json({
        ok: true,
        itineraryId: itinerary.id,
        bookingIds: createdBookingIds,
        paymentId: result.paymentId,
        totalAmount: totalAmountDollars,
      }, 201)
    } catch (txError: any) {
      // Transaction failed — nothing was charged yet (the Checkout Session is
      // simply abandoned and expires after 30 min), so no refund is needed.

      // Check for specific Prisma unique constraint violation (slot already booked)
      if (txError?.code === 'P2002') {
        return error(409, 'One of the requested slots is no longer available. The entire booking has been cancelled.')
      }

      console.error('[itinerary book] Transaction failed:', txError)
      return error(500, txError?.message || 'Failed to book itinerary. All changes have been rolled back.')
    }
  } catch (e) { return handleError(e) }
}
