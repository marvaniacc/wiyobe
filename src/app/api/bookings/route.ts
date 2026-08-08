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

    // if slot provided, lock it
    let slot: any = null
    if (body.slotId) {
      slot = await db.slot.findUnique({ where: { id: body.slotId } })
      if (!slot || slot.isBooked) return error(409, 'This slot is no longer available')
    }

    // Get commission rates (platform + affiliate) for this provider type
    const commissionRateRow = await db.commissionRate.findUnique({ where: { providerType: pt } })
    const platformRate = commissionRateRow?.rate || '12'
    const affiliateRate = commissionRateRow?.affiliateRate || '3'

    // Check if the provider was referred by an affiliate
    let affiliateUserId: string | null = null
    let affiliateClickId: string | null = null
    let affiliateRecord: any = null

    // Check provider's referral
    const providerAffClick = await db.affiliateClick.findFirst({
      where: { referredUserId: providerUserId, status: { in: ['SIGNED_UP', 'BOOKED', 'COMPLETED'] } },
      include: { affiliate: true },
      orderBy: { clickedAt: 'desc' },
    })

    if (providerAffClick?.affiliate) {
      affiliateUserId = providerAffClick.affiliate.userId
      affiliateClickId = providerAffClick.id
      affiliateRecord = providerAffClick.affiliate
    } else {
      // Check patient's referral
      const patientAffClick = await db.affiliateClick.findFirst({
        where: { referredUserId: session.id, status: { in: ['SIGNED_UP', 'BOOKED', 'COMPLETED'] } },
        include: { affiliate: true },
        orderBy: { clickedAt: 'desc' },
      })
      if (patientAffClick?.affiliate) {
        affiliateUserId = patientAffClick.affiliate.userId
        affiliateClickId = patientAffClick.id
        affiliateRecord = patientAffClick.affiliate
      }
    }

    // Calculate commissions
    // The provider ALWAYS pays: platformRate% + affiliateRate% (fixed, regardless of tier)
    // The tier bonus comes OUT OF the platform's share (platform gives part of its cut to the affiliate)
    //
    // Example: amount=$100, platform=12%, affiliate base=3%, Gold tier bonus=+2%
    //   Provider pays: 12% + 3% = 15% → Provider gets $85
    //   Affiliate gets: 3% + 2% = 5% → $5
    //   Platform gets: 12% - 2% = 10% → $10 (gives 2% bonus to affiliate from its share)
    //
    // If no affiliate: Provider pays 12% + 3% = 15%, Platform keeps all 15%
    const tierBonus = affiliateRecord ? parseFloat(affiliateRecord.tierBonusRate || '0') : 0
    const baseAffiliateRate = parseFloat(affiliateRate)

    // Affiliate gets base rate + tier bonus
    const effectiveAffiliateRate = baseAffiliateRate + tierBonus
    const affiliateCommission = affiliateUserId
      ? (parseFloat(amount) * (effectiveAffiliateRate / 100)).toFixed(2)
      : '0'

    // Platform gets its rate MINUS the tier bonus (bonus comes from platform's pocket)
    // If no affiliate: platform gets its rate + the full affiliate base rate
    const platformCut = affiliateUserId
      ? (parseFloat(amount) * ((parseFloat(platformRate) - tierBonus) / 100)).toFixed(2)
      : (parseFloat(amount) * ((parseFloat(platformRate) + baseAffiliateRate) / 100)).toFixed(2)

    // Provider always gets: amount - platformRate% - affiliateBaseRate% (tier doesn't affect provider)
    const totalCommissionFromProvider = (parseFloat(amount) * ((parseFloat(platformRate) + baseAffiliateRate) / 100)).toFixed(2)
    const providerNet = subDec(amount, totalCommissionFromProvider)

    // Video session URL for online visits — uses configured video provider
    // Generate with a temp ID (booking ID not yet created); the URL is room-based, not ID-dependent
    let videoSessionUrl: string | null = null
    if (body.visitType === 'ONLINE') {
      const { createVideoSession } = await import('@/lib/video')
      const tempId = `${session.id.slice(-4)}-${Date.now().toString(36)}`
      const videoSession = await createVideoSession(tempId, session.name || 'Patient', providerName)
      videoSessionUrl = videoSession.url
    }

    const booking = await db.booking.create({
      data: {
        patientId: session.id,
        providerType: pt,
        doctorId: pt === 'DOCTOR' ? body.providerId : null,
        hospitalId: pt === 'HOSPITAL' ? body.providerId : null,
        hotelId: pt === 'HOTEL' ? body.providerId : null,
        translatorId: pt === 'TRANSLATOR' ? body.providerId : null,
        serviceId: body.serviceId || null,
        slotId: body.slotId || null,
        visitType: body.visitType,
        status: 'CONFIRMED',
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        amount: toDec(amount),
        commissionRate: platformRate,
        commissionAmount: platformCut,
        affiliateRate: String(effectiveAffiliateRate),
        affiliateAmount: affiliateUserId ? affiliateCommission : '0',
        affiliateId: affiliateUserId,
        providerNetAmount: providerNet,
        videoSessionUrl,
        notes: body.notes,
      },
      include: { patient: { select: { name: true } }, service: true },
    })

    // mark slot booked
    if (slot) {
      await db.slot.update({ where: { id: slot.id }, data: { isBooked: true } })
    }

    // Payment — real Stripe charge if configured, otherwise mock for dev
    const { createCharge, isStripeConfigured } = await import('@/lib/stripe')
    let stripeChargeId = `ch_mock_${booking.id.slice(-8)}`
    let paymentStatus = 'SUCCEEDED'

    if (isStripeConfigured()) {
      const charge = await createCharge(
        parseFloat(amount),
        'usd',
        `MedTravel booking - ${providerName} - ${body.visitType === 'ONLINE' ? 'Online consultation' : 'In-person visit'}`,
        { bookingId: booking.id, patientId: session.id, providerType: pt }
      )
      if (charge) {
        stripeChargeId = charge.id
        paymentStatus = charge.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING'
      }
    }

    const payment = await db.payment.create({
      data: {
        bookingId: booking.id,
        stripeChargeId,
        amount: toDec(amount),
        status: paymentStatus as any,
      },
    })

    // Ledger entries — PATIENT_CHARGE, COMMISSION (platform), AFFILIATE_COMMISSION (if affiliate), PROVIDER_CREDIT
    const ledgerEntries: any[] = [
      {
        type: 'PATIENT_CHARGE',
        bookingId: booking.id,
        paymentId: payment.id,
        amount: toDec(amount),
        description: `Payment for ${providerName} — ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'}`,
      },
      {
        type: 'COMMISSION',
        bookingId: booking.id,
        paymentId: payment.id,
        amount: platformCut,
        description: `Platform commission (${platformRate}%${affiliateUserId ? ` - ${tierBonus}% tier bonus to affiliate` : ` + ${affiliateRate}% (no referrer)`})`,
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
        await db.affiliateClick.update({
          where: { id: affiliateClickId },
          data: { status: 'BOOKED', bookingId: booking.id, commissionAmount: affiliateCommission, convertedAt: new Date() },
        })
      }
      // Update affiliate aggregate stats
      await db.affiliate.update({
        where: { userId: affiliateUserId },
        data: {
          totalBookings: { increment: 1 },
          totalEarnings: (parseFloat(affiliateCommission) + parseFloat(
            (await db.affiliate.findUnique({ where: { userId: affiliateUserId }, select: { totalEarnings: true } }))?.totalEarnings || '0'
          )).toFixed(2),
          pendingBalance: (parseFloat(affiliateCommission) + parseFloat(
            (await db.affiliate.findUnique({ where: { userId: affiliateUserId }, select: { pendingBalance: true } }))?.pendingBalance || '0'
          )).toFixed(2),
        },
      })

      // Auto-promote tier if the affiliate qualifies for a higher tier
      const { checkAndPromoteTier } = await import('@/lib/affiliate-tiers')
      const affiliateRec = await db.affiliate.findUnique({ where: { userId: affiliateUserId } })
      if (affiliateRec) {
        await checkAndPromoteTier(affiliateRec.id)
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

    await db.ledgerEntry.createMany({ data: ledgerEntries })

    // Notifications — notify both patient and provider
    const patientUser = await db.user.findUnique({ where: { id: session.id }, select: { name: true } })
    const patientName = patientUser?.name || 'Patient'
    await notify({
      userId: session.id,
      type: 'booking_created',
      title: 'Booking confirmed!',
      body: `Your ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'} with ${providerName} has been confirmed.`,
      link: 'bookings',
      meta: { bookingId: booking.id, amount: toDec(amount) },
    })
    await notify({
      userId: providerUserId,
      type: 'booking_created',
      title: 'New booking received',
      body: `${patientName} booked a ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'} with you.`,
      link: 'appointments',
      meta: { bookingId: booking.id, amount: toDec(amount) },
    })

    // Send confirmation emails
    const { sendEmail, bookingConfirmationEmail } = await import('@/lib/email')
    const bookingDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(booking.startDate))
    const patientEmailTemplate = bookingConfirmationEmail(patientName, providerName, bookingDate, toDec(amount), body.visitType)
    await sendEmail({ to: session.email, subject: patientEmailTemplate.subject, html: patientEmailTemplate.html })

    const providerUser = await db.user.findUnique({ where: { id: providerUserId }, select: { email: true } })
    if (providerUser) {
      const providerEmailTemplate = bookingConfirmationEmail(providerName, patientName, bookingDate, toDec(amount), body.visitType)
      await sendEmail({ to: providerUser.email, subject: providerEmailTemplate.subject, html: providerEmailTemplate.html })
    }

    return json({ booking, payment }, 201)
  } catch (e) { return handleError(e) }
}
