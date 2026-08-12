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

    const totalAmountCents = itinerary.totalEstimatedCost
    const totalAmountDollars = (totalAmountCents / 100).toFixed(2)

    // === Step 1: Process payment (mock or Stripe) ===
    const { createCharge, isStripeConfigured } = await import('@/lib/stripe')
    let stripeChargeId = `ch_mock_itin_${itinerary.id.slice(-8)}`
    let paymentStatus = 'SUCCEEDED'

    if (isStripeConfigured()) {
      const charge = await createCharge(
        totalAmountCents / 100,
        'usd',
        `MedTravel itinerary booking - ${itinerary.items.length} services`,
        { itineraryId: itinerary.id, patientId: session.id }
      )
      if (charge) {
        stripeChargeId = charge.id
        paymentStatus = charge.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING'
      }
    }

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
        // Create a single payment record for the entire itinerary
        const payment = await tx.payment.create({
          data: {
            bookingId: `itin_${itinerary.id}`, // placeholder — will be updated per-booking
            stripeChargeId,
            amount: toDec(totalAmountDollars),
            currency: 'USD',
            status: paymentStatus as any,
          },
        })

        // Process each itinerary item as a separate booking
        for (let i = 0; i < itinerary.items.length; i++) {
          const item = itinerary.items[i]
          const itemAmountDollars = (item.estimatedCost / 100).toFixed(2)

          // Resolve provider user ID
          const providerUserId = await resolveProviderUser({
            providerType: item.providerType,
            doctorId: item.providerType === 'DOCTOR' ? item.providerId : null,
            hospitalId: item.providerType === 'HOSPITAL' ? item.providerId : null,
            hotelId: item.providerType === 'HOTEL' ? item.providerId : null,
            translatorId: item.providerType === 'TRANSLATOR' ? item.providerId : null,
          })

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
            const platformCut = (parseFloat(itemAmountDollars) * parseFloat(platformRate) / 100).toFixed(2)
            bookingAffiliateAmount = (parseFloat(platformCut) * parseFloat(affRate) / 100).toFixed(2)
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

          // Update the payment to link to the first booking
          if (i === 0) {
            await tx.payment.update({
              where: { id: payment.id },
              data: { bookingId: booking.id },
            })
          }

          // Build ledger entries for this booking
          ledgerEntries.push(
            {
              bookingId: booking.id,
              paymentId: payment.id,
              userId: session.id,
              type: 'PATIENT_CHARGE',
              amount: toDec(itemAmountDollars),
              description: `Payment for ${item.providerType} service (itinerary)`,
            },
            {
              bookingId: booking.id,
              paymentId: payment.id,
              type: 'COMMISSION',
              amount: platformCut,
              description: `Platform commission (${platformRate}%)`,
            },
            {
              bookingId: booking.id,
              paymentId: payment.id,
              userId: providerUserId,
              type: 'PROVIDER_CREDIT',
              amount: providerNet,
              description: 'Provider credit (pending until service completion)',
            }
          )

          // Affiliate commission ledger entry (only for first booking)
          if (i === 0 && bookingAffiliateUserId && parseFloat(bookingAffiliateAmount) > 0) {
            ledgerEntries.push({
              bookingId: booking.id,
              paymentId: payment.id,
              userId: bookingAffiliateUserId,
              type: 'AFFILIATE_COMMISSION',
              amount: bookingAffiliateAmount,
              description: `Affiliate commission (${affRate}% of platform)`,
            })

            // Update affiliate stats
            const affRec = await tx.affiliate.findUnique({ where: { userId: bookingAffiliateUserId } })
            if (affRec) {
              await tx.affiliate.update({
                where: { userId: bookingAffiliateUserId },
                data: {
                  totalBookings: { increment: 1 },
                  totalEarnings: (parseFloat(bookingAffiliateAmount) + parseFloat(affRec.totalEarnings || '0')).toFixed(2),
                  pendingBalance: (parseFloat(bookingAffiliateAmount) + parseFloat(affRec.pendingBalance || '0')).toFixed(2),
                },
              })
            }
          }
        }

        // Create all ledger entries
        await tx.ledgerEntry.createMany({ data: ledgerEntries })

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
      // Transaction failed — refund the payment if it was real Stripe
      if (isStripeConfigured() && !stripeChargeId.startsWith('ch_mock_')) {
        const { refundPayment } = await import('@/lib/stripe')
        await refundPayment(stripeChargeId, totalAmountCents / 100).catch(() => {})
      }

      // Check for specific Prisma unique constraint violation (slot already booked)
      if (txError?.code === 'P2002') {
        return error(409, 'One of the requested slots is no longer available. The entire booking has been cancelled.')
      }

      console.error('[itinerary book] Transaction failed:', txError)
      return error(500, txError?.message || 'Failed to book itinerary. All changes have been rolled back.')
    }
  } catch (e) { return handleError(e) }
}
