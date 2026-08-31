import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { resolveProviderUser } from '@/lib/ledger'
import { notify } from '@/lib/notify'
import { toDec, mulDec, subDec } from '@/lib/money'
import { arePaymentsEnabled } from '@/lib/stripe'
import { normalizeVisitType, ModalityError, slotFilterForModality } from '@/lib/modality'
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
  // Migration Plan v3: product modalities VIDEO/CHAT added; legacy ONLINE
  // remains accepted (historical representation of VIDEO).
  visitType: z.enum(['IN_PERSON', 'ONLINE', 'VIDEO', 'CHAT']),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'startDate must be a valid ISO datetime' }),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'endDate must be a valid ISO datetime' }).optional(),
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

    // Canonical modality for this booking request — central semantics module.
    // Unknown values are rejected before ANY side effect. Legacy ONLINE
    // normalizes to VIDEO (runtime compatibility, rows never rewritten).
    let modality: ReturnType<typeof normalizeVisitType>
    try {
      modality = normalizeVisitType(body.visitType)
    } catch (e) {
      // Item 2 (v3 review): an unrecognized/invalid visitType is invalid
      // INPUT -> HTTP 400 generic invalid-input, NOT 422. The zod enum in
      // createSchema is the primary gate (unknown values already fail there
      // with 400 'Validation error'); this catch is defense-in-depth so no
      // code path can return 422 for an invalid value. 422 MODALITY_MISMATCH
      // is RESERVED for a valid modality that conflicts with the configured
      // modality of the service (or an explicitly supplied slot).
      if (e instanceof ModalityError) return error(400, 'Invalid visitType', e.message)
      throw e
    }

    // Admin-configurable booking guardrails (SiteSetting)
    const { getSetting } = await import('@/lib/site-settings')
    const [leadHoursStr, maxDaysStr] = await Promise.all([
      getSetting('minBookingLeadHours'),
      getSetting('maxBookingDaysAhead'),
    ])
    const startMs = Date.parse(body.startDate)
    if (Number.isFinite(startMs)) {
      const leadHours = Math.max(0, parseInt(leadHoursStr || '2', 10) || 0)
      if (startMs < Date.now() + leadHours * 3600_000) {
        return error(422, `Bookings must be at least ${leadHours} hour${leadHours === 1 ? '' : 's'} in advance.`)
      }
      const maxDays = parseInt(maxDaysStr || '180', 10)
      if (maxDays > 0 && startMs > Date.now() + maxDays * 86_400_000) {
        return error(422, `Bookings can be made at most ${maxDays} days ahead.`)
      }
    }

    // resolve provider + price
    let providerUserId: string | null = null
    let amount = '0'
    let providerName = ''
    if (pt === 'DOCTOR') {
      const d = await db.doctor.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!d || !d.verified) return error(404, 'Doctor not found or not verified')
      providerUserId = d.userId
      providerName = d.user.name || 'Doctor'
      // Pricing semantics (audited): the existing app prices "non-physically-
      // present" visits at onlineFee and in-person visits at consultationFee.
      // Canonical modality keeps that meaning: VIDEO and CHAT use onlineFee,
      // IN_PERSON uses consultationFee. When an explicitly classified Service
      // is supplied below, its own price overrides this base amount.
      amount = modality === 'IN_PERSON' ? d.consultationFee : d.onlineFee
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

    // Override amount with the service price — but the service MUST belong to
    // the booked provider and be active. Otherwise a patient could book any
    // provider while paying another provider's (cheap) price.
    if (body.serviceId) {
      const svcOwnership =
        pt === 'DOCTOR' ? { doctorId: body.providerId }
        : pt === 'HOSPITAL' ? { hospitalId: body.providerId }
        : pt === 'HOTEL' ? { hotelId: body.providerId }
        : { translatorId: body.providerId }
      const svc = await db.service.findFirst({
        where: { id: body.serviceId, providerType: pt, isActive: true, ...svcOwnership },
      })
      if (!svc) return error(400, 'Selected service is not available for this provider')
      amount = svc.price

      // Migration Plan v3 — Service × Slot modality compatibility:
      // For an explicitly classified Service (modality != NULL), normalize()
      // of both sides must match. Enforced BEFORE slot claim / promo reserve /
      // video-room creation, so a failed validation consumes nothing.
      //
      // DELIBERATE — DO NOT "FIX" (item 3, v3 review): the `if (svc.modality)`
      // guard intentionally makes a Service with modality = NULL skip ALL
      // modality validation, including the slot-compatibility check below.
      // Legacy services are never validated against a modality they don't
      // have; classification happens later via a controlled workflow
      // (Decision 4 — no batch inference on production).
      if (svc.modality) {
        if (modality !== svc.modality) {
          // Item 1 (v3 review): top-level "error" is the exact literal
          // "MODALITY_MISMATCH" — the human-readable explanation goes in the
          // separate "details" field, never concatenated into "error".
          return error(422, 'MODALITY_MISMATCH', `requested ${modality} but service modality is ${svc.modality}`)
        }
        // A booked slot must also agree with the classified service's modality
        // when one is supplied. (Compatibility mapping handles legacy ONLINE.)
        if (body.slotId) {
          const slotRow = await db.slot.findUnique({ where: { id: body.slotId }, select: { visitType: true } })
          if (slotRow && normalizeVisitType(slotRow.visitType) !== modality) {
            return error(422, 'MODALITY_MISMATCH', `requested ${modality} but slot is ${normalizeVisitType(slotRow.visitType)}`)
          }
        }
      }
    } else if (body.slotId) {
      // No explicit service — defense-in-depth for the UI's "multi-match
      // requires an explicit choice" rule: when the provider has MORE THAN
      // ONE active classified Service for the requested modality, refusing
      // to guess which one the patient meant (a silent legacy-fee fallback
      // could charge a price the patient never saw displayed). Exactly one
      // match is fine here because the UI auto-selects it; zero matches is
      // the legacy path (Decision 4) and stays permissive. Direct API calls
      // cannot bypass the client-side disabled Continue button.
      const ownershipColumn =
        pt === 'DOCTOR' ? { doctorId: body.providerId }
        : pt === 'HOSPITAL' ? { hospitalId: body.providerId }
        : pt === 'HOTEL' ? { hotelId: body.providerId }
        : { translatorId: body.providerId }
      const classifiedCount = await db.service.count({
        where: { providerType: pt, isActive: true, modality: modality, ...ownershipColumn },
      })
      if (classifiedCount > 1) {
        return error(400, 'SERVICE_CHOICE_REQUIRED', `${classifiedCount} active ${modality} services exist for this provider — serviceId is required`)
      }
      // Still prevent cross-modality slot consumption,
      // e.g. claiming an IN_PERSON-only slot for a VIDEO request. Compare in
      // canonical space so historical ONLINE slots satisfy VIDEO requests.
      const slotRow = await db.slot.findUnique({ where: { id: body.slotId }, select: { visitType: true } })
      if (slotRow && slotFilterForModality(normalizeVisitType(slotRow.visitType))[0] !== modality) {
        return error(422, 'MODALITY_MISMATCH', `requested ${modality} but slot is ${normalizeVisitType(slotRow.visitType)}`)
      }
    }

    // If slot provided, CLAIM it atomically — updateMany with isBooked:false
    // precondition guarantees only one concurrent request can win; the loser
    // gets 0 updated rows and a 409 instead of a double-booking.
    let slot: any = null
    if (body.slotId) {
      const slotOwnership =
        pt === 'DOCTOR' ? { doctorId: body.providerId }
        : pt === 'HOSPITAL' ? { hospitalId: body.providerId }
        : pt === 'TRANSLATOR' ? { translatorId: body.providerId }
        : null // hotels have no slots
      if (!slotOwnership) return error(400, 'Slots are not supported for this provider type')
      const claimed = await db.slot.updateMany({
        where: { id: body.slotId, isBooked: false, ...slotOwnership },
        data: { isBooked: true },
      })
      if (claimed.count === 0) return error(409, 'This slot is no longer available')
      slot = { id: body.slotId }
    }

    // Compensation helper — if any later step of the multi-write booking flow
    // fails, we must not leave a claimed slot (or reserved promo use) orphaned.
    const releaseSlotIfClaimed = async () => {
      if (slot) {
        await db.slot.updateMany({ where: { id: slot.id, isBooked: true }, data: { isBooked: false } }).catch(() => {})
      }
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
          // Reserve one use ATOMICALLY — the updateMany precondition
          // (usedCount < maxUses, still active) makes concurrent bookings
          // unable to exceed maxUses; a losing reservation returns 0 rows.
          const reserved = await db.promoCode.updateMany({
            where: {
              id: promoCodeRecord.id,
              isActive: true,
              ...(promoCodeRecord.maxUses !== null ? { usedCount: { lt: promoCodeRecord.maxUses } } : {}),
            },
            data: { usedCount: { increment: 1 } },
          })
          if (reserved.count === 0) {
            await releaseSlotIfClaimed() // promo exhausted → release slot claim
            return error(409, 'This promo code has just reached its usage limit')
          }
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

    // Video session URL for VIDEO visits — uses configured video provider.
    // Fulfillment semantics: only the canonical VIDEO modality creates a room.
    // CHAT and IN_PERSON never do. Legacy 'ONLINE' requests normalize to VIDEO
    // above, so historical behavior is preserved exactly.
    // Room name: high-entropy CSPRNG (generateSecureRoomName) — NOT derived
    // from the booking id (the old wishubest-<id8> pattern was guessable).
    // The generated URL is stored on the Booking row (videoSessionUrl) and is
    // only revealed to participants via GET /api/bookings/[id]/video/join.
    let videoSessionUrl: string | null = null
    if (modality === 'VIDEO') {
      const { createVideoSession } = await import('@/lib/video')
      const { generateSecureRoomName } = await import('@/lib/video-token')
      const videoSession = await createVideoSession(generateSecureRoomName(), session.name || 'Patient', providerName)
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
        // Item 4 (v3 review): normalize ONLINE -> VIDEO on NEW booking
        // writes, mirroring Slot writes, so new Booking rows also prefer
        // VIDEO. HISTORICAL ROWS ARE NEVER REWRITTEN — this affects the
        // value written for new inserts only. Clients sending ONLINE keep
        // full compatibility (normalize treats ONLINE == VIDEO everywhere).
        visitType: body.visitType === 'ONLINE' ? 'VIDEO' : body.visitType,
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
    }).catch(async (bkErr) => {
      // Compensation: slot/promo were reserved but the booking row failed.
      await releaseSlotIfClaimed()
      if (promoCodeId) {
        await db.promoCode.updateMany({ where: { id: promoCodeId }, data: { usedCount: { decrement: 1 } } }).catch(() => {})
      }
      throw bkErr
    })

    // Increment promo code usedCount — already reserved atomically above
    // (guarded updateMany); nothing further to do here.

    // NO CHARGE HAPPENS HERE. Payment is collected on the dedicated checkout
    // page via Stripe Checkout (/api/checkout/session → hosted payment →
    // /api/checkout/confirm + webhook finalize). The booking stays PENDING
    // (unpaid) until then. If payments are disabled platform-wide, the
    // booking is created with status PENDING_PAYMENT so providers/patients
    // can see it awaits offline arrangement or later activation.
    const paymentsLive = await arePaymentsEnabled()
    if (!paymentsLive) {
      await db.booking.update({ where: { id: booking.id }, data: { notes: prependNote(booking.notes, '[AWAITING PAYMENT — online checkout currently disabled]') } }).catch(() => {})
    }

    // Release the slot hold only when we could NOT persist a payable booking
    // (compensation already handled above; nothing further needed here).

// A Payment row is NOT created here — it is created by /api/checkout/session
    // when the patient proceeds to checkout, and marked SUCCEEDED only by
    // /api/checkout/confirm or the Stripe webhook after verified payment.

    // Notify patient + provider that an UNPAID booking awaits checkout.
    const patientUser = await db.user.findUnique({ where: { id: session.id }, select: { name: true } })
    const patientName = patientUser?.name || 'Patient'
    await notify({
      userId: session.id,
      type: 'booking_created',
      title: 'Booking created',
      // Decision-2 compliance (found during the item-4 conflict check): use
      // the canonical modality, not a raw ONLINE/IN_PERSON ternary. The prior
      // WIP ternary mislabeled VIDEO/CHAT requests as "in-person visit".
      // Legacy ONLINE clients now see "video consultation" (display-only,
      // consistent with the calendar-feed label change already in this WIP).
      body: `Your ${modality === 'IN_PERSON' ? 'in-person visit' : modality === 'CHAT' ? 'chat consultation' : 'video consultation'} with ${providerName} is reserved. Complete payment to confirm it.`,
      link: 'bookings',
      meta: { bookingId: booking.id, amount: patientCharge },
    })
    await notify({
      userId: providerUserId,
      type: 'booking_created',
      title: 'New booking request',
      body: `${patientName} booked a ${modality === 'IN_PERSON' ? 'in-person visit' : modality === 'CHAT' ? 'chat consultation' : 'video consultation'} with you — awaiting payment.`,
      link: 'appointments',
      meta: { bookingId: booking.id, amount: toDec(amount) },
    })

    return json({ booking, checkoutUrl: `/checkout/${booking.id}` }, 201)
  } catch (e) { return handleError(e) }
}

// Prefix a note while preserving any existing notes text.
function prependNote(existing: string | null | undefined, marker: string): string {
  return existing ? `${marker}\n${existing}` : marker
}
