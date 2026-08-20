import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { resolveProviderUser } from '@/lib/ledger'
import { notify } from '@/lib/notify'
import { toDec, mulDec, subDec } from '@/lib/money'
import { z } from 'zod'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const role = searchParams.get('role') // for admin filter

    let where: any = {}
    if (session.role === 'PATIENT') {
      where.patientId = session.id
    } else if (session.role === 'ADMIN') {
      if (role === 'patient' && searchParams.get('patientId')) where.patientId = searchParams.get('patientId')
    } else {
      // provider: bookings where they are the provider
      const providerUser = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
      const d = providerUser?.doctor?.id, h = providerUser?.hospital?.id, ho = providerUser?.hotel?.id, t = providerUser?.translator?.id
      where = {
        OR: [
          ...(d ? [{ doctorId: d }] : []),
          ...(h ? [{ hospitalId: h }] : []),
          ...(ho ? [{ hotelId: ho }] : []),
          ...(t ? [{ translatorId: t }] : []),
        ],
      }
    }
    if (status) where.status = status

    const bookings = await db.booking.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, email: true, avatarUrl: true } },
        doctor: { include: { user: { select: { name: true } } } },
        hospital: { include: { user: { select: { name: true } } } },
        hotel: { include: { user: { select: { name: true } } } },
        translator: { include: { user: { select: { name: true } } } },
        service: true,
        slot: true,
        payment: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return json({ bookings })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
  providerId: z.string(),
  serviceId: z.string().optional(),
  slotId: z.string().optional(),
  visitType: z.enum(['IN_PERSON', 'ONLINE']),
  startDate: z.string(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
  promoCode: z.string().optional(), // optional promo code to apply at checkout
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Only patients can book')

    const body = await parseBody(req, createSchema)
    const pt = body.providerType as ProviderType

    // resolve provider + price
    let providerUserId: string | null = null
    let amount = '0'
    let providerName = ''
    if (pt === 'DOCTOR') {
      const d = await db.doctor.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!d || !d.verified) return error(404, 'Doctor not found or not verified')
      providerUserId = d.userId
      providerName = d.user.name || 'Doctor'
      amount = body.visitType === 'ONLINE' ? d.onlineFee : d.consultationFee
    } else if (pt === 'HOSPITAL') {
      const h = await db.hospital.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!h || !h.verified) return error(404, 'Hospital not found')
      providerUserId = h.userId
      providerName = h.name
      amount = h.baseFee
    } else if (pt === 'HOTEL') {
      const h = await db.hotel.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!h || !h.verified) return error(404, 'Hotel not found')
      providerUserId = h.userId
      providerName = h.name
      amount = h.pricePerNight
    } else if (pt === 'TRANSLATOR') {
      const t = await db.translator.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!t || !t.verified) return error(404, 'Translator not found')
      providerUserId = t.userId
      providerName = t.user.name || 'Translator'
      amount = t.hourlyRate
    }
    if (!providerUserId) return error(400, 'Could not resolve provider')

    // override amount with service price if provided
    if (body.serviceId) {
      const svc = await db.service.findUnique({ where: { id: body.serviceId } })
      if (svc) amount = svc.price
    }

    // Get commission rates (platform + affiliate) for this provider type
    const commissionRateRow = await db.commissionRate.findUnique({ where: { providerType: pt } })
    const platformRate = commissionRateRow?.rate || '12'
    const affiliateRate = commissionRateRow?.affiliateRate || '25' // % of platform commission

    // Affiliate attribution — Patient Referral Priority (Strategy A) with time limit:
    // 1. If the patient has a referredByAffiliateId, attribute to that affiliate (priority).
    // 2. If the patient has NO affiliate, check the provider's referredByAffiliateId.
    //    The provider's affiliate only qualifies if the provider signed up within the last 365 days.
    // 3. Self-referral prevention: if the affiliate.userId === session.id, skip attribution.
    let affiliateUserId: string | null = null
    let affiliateClickId: string | null = null

    const REFERRAL_TTL_MS = 365 * 24 * 60 * 60 * 1000 // 365 days

    // Step 1: Check patient's referral first (priority)
    const patientReferral = await db.user.findUnique({
      where: { id: session.id },
      select: { referredByAffiliateId: true },
    })

    if (patientReferral?.referredByAffiliateId) {
      const patientAff = await db.affiliate.findUnique({
        where: { id: patientReferral.referredByAffiliateId },
      })
      // Self-referral prevention: if the patient IS the affiliate, skip
      if (patientAff && patientAff.verified && patientAff.userId !== session.id) {
        affiliateUserId = patientAff.userId
        const patientAffClick = await db.affiliateClick.findFirst({
          where: { affiliateId: patientAff.id, referredUserId: session.id, status: { in: ['SIGNED_UP', 'BOOKED', 'COMPLETED'] } },
          orderBy: { clickedAt: 'desc' },
        })
        affiliateClickId = patientAffClick?.id || null
      }
    }

    // Step 2: If patient has no affiliate, check provider's referral with 365-day time limit
    if (!affiliateUserId) {
      const providerUser = await db.user.findUnique({
        where: { id: providerUserId },
        select: { referredByAffiliateId: true, referredAt: true },
      })

      if (providerUser?.referredByAffiliateId && providerUser.referredAt) {
        const daysSinceReferral = Date.now() - new Date(providerUser.referredAt).getTime()
        if (daysSinceReferral <= REFERRAL_TTL_MS) {
          const providerAff = await db.affiliate.findUnique({
            where: { id: providerUser.referredByAffiliateId },
          })
          // Self-referral prevention: if the provider IS the affiliate (shouldn't happen but guard)
          if (providerAff && providerAff.verified && providerAff.userId !== session.id) {
            affiliateUserId = providerAff.userId
            const providerAffClick = await db.affiliateClick.findFirst({
              where: { affiliateId: providerAff.id, referredUserId: providerUserId, status: { in: ['SIGNED_UP', 'BOOKED', 'COMPLETED'] } },
              orderBy: { clickedAt: 'desc' },
            })
            affiliateClickId = providerAffClick?.id || null
          }
        }
      }
    }

    // Calculate commissions — new model:
    // Platform takes platformRate% of the booking amount.
    // Affiliate gets affiliateRate% of the PLATFORM'S COMMISSION (not the booking amount).
    // Provider pays only platformRate% (affiliate commission comes out of platform's pocket).
    //
    // With a promo code: the discount is deducted from the PLATFORM's commission.
    // The provider ALWAYS receives their full net share (unchanged).
    // The affiliate commission is recalculated on the REDUCED platform commission.
    //
    // Example: amount=$100, platform=12%, affiliate=25%, promo=10% ($10)
    //   Original platform commission = $100 * 12% = $12
    //   Discount (capped at platformCut) = min($10, $12) = $10
    //   New platform commission = $12 - $10 = $2.00
    //   Affiliate commission = $2 * 25% = $0.50
    //   Platform keeps = $2 - $0.50 = $1.50
    //   Provider gets = $100 - $12 = $88.00 (UNCHANGED)
    //   Patient pays = $100 - $10 = $90.00
    const basePlatformCut = (parseFloat(amount) * (parseFloat(platformRate) / 100))

    // === Promo code validation + discount calculation ===
    let promoCodeId: string | null = null
    let discountAmount = 0
    let promoCodeRecord: any = null
    if (body.promoCode) {
      const code = body.promoCode.toUpperCase().trim()
      promoCodeRecord = await db.promoCode.findUnique({ where: { code } })
      if (promoCodeRecord) {
        // Validate: active, not expired, under maxUses
        const isValid = promoCodeRecord.isActive
          && (!promoCodeRecord.expiryDate || new Date(promoCodeRecord.expiryDate) >= new Date())
          && (promoCodeRecord.maxUses === null || promoCodeRecord.usedCount < promoCodeRecord.maxUses)
        if (isValid) {
          let rawDiscount: number
          if (promoCodeRecord.discountType === 'PERCENTAGE') {
            rawDiscount = parseFloat(amount) * (promoCodeRecord.discountValue / 100)
          } else {
            rawDiscount = promoCodeRecord.discountValue / 100 // cents → dollars
          }
          // Cap at platform commission — provider revenue is NEVER reduced.
          discountAmount = Math.min(rawDiscount, basePlatformCut)
          promoCodeId = promoCodeRecord.id
        }
      }
    }

    const platformCut = (basePlatformCut - discountAmount).toFixed(2)
    const patientCharge = (parseFloat(amount) - discountAmount).toFixed(2)
    const affiliateCommission = affiliateUserId
      ? (parseFloat(platformCut) * (parseFloat(affiliateRate) / 100)).toFixed(2)
      : '0'
    const providerNet = subDec(amount, basePlatformCut.toFixed(2)) // UNCHANGED — full net share

    // Video session URL for online visits — uses configured video provider
    // Generate with a temp ID (booking ID not yet created); the URL is room-based, not ID-dependent
    let videoSessionUrl: string | null = null
    if (body.visitType === 'ONLINE') {
      const { createVideoSession } = await import('@/lib/video')
      const tempId = `${session.id.slice(-4)}-${Date.now().toString(36)}`
      const videoSession = await createVideoSession(tempId, session.name || 'Patient', providerName)
      videoSessionUrl = videoSession.url
    }

    // Everything from the slot claim to the ledger entries runs in ONE
    // transaction. The slot is claimed with a conditional UPDATE (atomic),
    // so concurrent requests cannot both book it — and if anything later in
    // the transaction fails, the claim is rolled back.
    const { booking, payment } = await db.$transaction(async (tx) => {
      // Atomically claim the slot (conditional update — only succeeds once)
      let slotId: string | null = null
      if (body.slotId) {
        const claimed = await tx.slot.updateMany({
          where: { id: body.slotId, isBooked: false },
          data: { isBooked: true },
        })
        if (claimed.count === 0) throw new Error('SLOT_UNAVAILABLE')
        slotId = body.slotId
      }

      const booking = await tx.booking.create({
        data: {
          patientId: session.id,
          providerType: pt,
          doctorId: pt === 'DOCTOR' ? body.providerId : null,
          hospitalId: pt === 'HOSPITAL' ? body.providerId : null,
          hotelId: pt === 'HOTEL' ? body.providerId : null,
          translatorId: pt === 'TRANSLATOR' ? body.providerId : null,
          serviceId: body.serviceId || null,
          slotId,
          visitType: body.visitType,
          status: 'PENDING',
          startDate: new Date(body.startDate),
          endDate: body.endDate ? new Date(body.endDate) : null,
          amount: toDec(amount),
          commissionRate: platformRate,
          commissionAmount: platformCut,           // reduced platform commission (after promo discount)
          affiliateRate: affiliateRate,
          affiliateAmount: affiliateUserId ? affiliateCommission : '0',
          affiliateId: affiliateUserId,
          providerNetAmount: providerNet,           // UNCHANGED — full net share
          promoCodeId: promoCodeId,                // null if no code applied
          discountAmount: discountAmount.toFixed(2), // snapshot of the discount applied
          videoSessionUrl,
          notes: body.notes,
        },
        include: { patient: { select: { name: true } }, service: true, promoCode: { select: { code: true } } },
      })

      // Increment promo code usedCount — only on successful booking creation.
      if (promoCodeId) {
        await tx.promoCode.update({
          where: { id: promoCodeId },
          data: { usedCount: { increment: 1 } },
        })
      }

      // Payment — real Stripe charge if configured, otherwise mock for dev.
      // The patient is charged the DISCOUNTED amount (amount - discountAmount).
      const { createCharge, isStripeConfigured } = await import('@/lib/stripe')
      let stripeChargeId = `ch_mock_${booking.id.slice(-8)}`
      let paymentStatus = 'SUCCEEDED'

      if (isStripeConfigured()) {
        const charge = await createCharge(
          parseFloat(patientCharge),
          'usd',
          `MedTravel booking - ${providerName} - ${body.visitType === 'ONLINE' ? 'Online consultation' : 'In-person visit'}`,
          { bookingId: booking.id, patientId: session.id, providerType: pt }
        )
        if (charge) {
          stripeChargeId = charge.id
          paymentStatus = charge.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING'
        }
      }

      const payment = await tx.payment.create({
        data: {
          bookingId: booking.id,
          stripeChargeId,
          amount: patientCharge,  // discounted amount the patient actually paid
          status: paymentStatus as any,
        },
      })

      // Ledger entries — PATIENT_CHARGE (discounted), COMMISSION (reduced platform cut),
      // AFFILIATE_COMMISSION (based on reduced platform cut), PROVIDER_CREDIT (full net).
      // The discount comes out of the platform's commission, not the provider's revenue.
      const ledgerEntries: any[] = [
        {
          type: 'PATIENT_CHARGE',
          bookingId: booking.id,
          paymentId: payment.id,
          amount: patientCharge,
          description: `Payment for ${providerName} — ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'}${promoCodeId ? ` (promo: ${booking.promoCode?.code || ''})` : ''}`,
        },
        {
          type: 'COMMISSION',
          bookingId: booking.id,
          paymentId: payment.id,
          amount: platformCut,
          description: `Platform commission (${platformRate}%${discountAmount > 0 ? `, promo discount -$${discountAmount.toFixed(2)}` : ''})`,
        },
      ]

      // Affiliate commission entry (only if affiliate exists)
      if (affiliateUserId) {
        ledgerEntries.push({
          type: 'AFFILIATE_COMMISSION',
          bookingId: booking.id,
          paymentId: payment.id,
          userId: affiliateUserId,
          amount: affiliateCommission,
          description: `Affiliate commission (${affiliateRate}%) for referral`,
        })

        // Update affiliate click status and earnings
        if (affiliateClickId) {
          await tx.affiliateClick.update({
            where: { id: affiliateClickId },
            data: { status: 'BOOKED', bookingId: booking.id, commissionAmount: affiliateCommission, convertedAt: new Date() },
          })
        }
        // Update affiliate aggregate stats
        const affRec = await tx.affiliate.findUnique({ where: { userId: affiliateUserId } })
        if (affRec) {
          await tx.affiliate.update({
            where: { userId: affiliateUserId },
            data: {
              totalBookings: { increment: 1 },
              totalEarnings: (parseFloat(affiliateCommission) + parseFloat(affRec.totalEarnings || '0')).toFixed(2),
              pendingBalance: (parseFloat(affiliateCommission) + parseFloat(affRec.pendingBalance || '0')).toFixed(2),
            },
          })
        }
      }

      // Provider credit (net amount after both commissions)
      ledgerEntries.push({
        type: 'PROVIDER_CREDIT',
        bookingId: booking.id,
        paymentId: payment.id,
        userId: providerUserId,
        amount: providerNet,
        description: 'Provider credit (pending until service completion)',
      })

      await tx.ledgerEntry.createMany({ data: ledgerEntries })

      return { booking, payment }
    })

    // Notifications — notify both patient and provider
    const patientUser = await db.user.findUnique({ where: { id: session.id }, select: { name: true } })
    const patientName = patientUser?.name || 'Patient'
    await notify({
      userId: session.id,
      type: 'booking_created',
      title: 'Booking confirmed!',
      body: `Your ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'} with ${providerName} has been confirmed.`,
      link: 'bookings',
      meta: { bookingId: booking.id, amount: patientCharge },
    })
    await notify({
      userId: providerUserId,
      type: 'booking_created',
      title: 'New booking received',
      body: `${patientName} booked a ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'} with you.`,
      link: 'appointments',
      meta: { bookingId: booking.id, amount: toDec(amount) },
    })

    // Send confirmation emails — patient sees the discounted amount they paid;
    // provider sees the full booking amount (their revenue is unaffected by promos).
    const { sendEmail, bookingConfirmationEmail } = await import('@/lib/email')
    const bookingDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(booking.startDate))
    const patientEmailTemplate = bookingConfirmationEmail(patientName, providerName, bookingDate, patientCharge, body.visitType)
    await sendEmail({ to: session.email, subject: patientEmailTemplate.subject, html: patientEmailTemplate.html })

    const providerUser = await db.user.findUnique({ where: { id: providerUserId }, select: { email: true } })
    if (providerUser) {
      const providerEmailTemplate = bookingConfirmationEmail(providerName, patientName, bookingDate, toDec(amount), body.visitType)
      await sendEmail({ to: providerUser.email, subject: providerEmailTemplate.subject, html: providerEmailTemplate.html })
    }

    return json({ booking, payment }, 201)
  } catch (e) { return handleError(e) }
}
