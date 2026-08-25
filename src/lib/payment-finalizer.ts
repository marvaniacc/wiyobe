import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { toDec, subDec, mulDec } from '@/lib/money'
import type { Booking, Payment } from '@prisma/client'

/**
 * finalizePaidBooking — the SINGLE code path that turns a paid booking into a
 * CONFIRMED one. Called from:
 *   • GET /api/checkout/confirm  (patient redirected back from Stripe)
 *   • POST /api/stripe/webhook   (checkout.session.completed — authoritative)
 *
 * Idempotent: re-running on an already-CONFIRMED booking is a no-op, so
 * double delivery from both paths is safe.
 *
 * On success it: marks payment SUCCEEDED, confirms booking, writes ledger
 * entries (patient charge / platform commission / provider credit /
 * affiliate commission), updates affiliate aggregates + click status.
 */
export async function finalizePaidBooking(bookingId: string, stripeIds: { sessionId?: string; paymentIntentId?: string; chargeId?: string }): Promise<{ finalized: boolean; alreadyDone: boolean }> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      patient: { select: { id: true, name: true, email: true } },
      service: true,
      doctor: { include: { user: { select: { id: true, name: true, email: true } } } },
      hospital: { include: { user: { select: { id: true, name: true, email: true } } } },
      hotel: { include: { user: { select: { id: true, name: true, email: true } } } },
      translator: { include: { user: { select: { id: true, name: true, email: true } } } },
      promoCode: { select: { code: true } },
      payment: true,
    },
  })
  if (!booking) return { finalized: false, alreadyDone: false }

  // Already processed (by confirm or webhook) — idempotent no-op.
  if (booking.status !== 'PENDING') return { finalized: false, alreadyDone: true }

  let payment = booking.payment as Payment | null

  // Atomically transition the booking PENDING → CONFIRMED. The updateMany
  // precondition makes concurrent confirm+webhook deliveries safe: exactly
  // one caller performs the money-mutating work below.
  const claimed = await db.booking.updateMany({
    where: { id: booking.id, status: 'PENDING' },
    data: { status: 'CONFIRMED' },
  })
  if (claimed.count === 0) return { finalized: false, alreadyDone: true }

  try {
    if (!payment) {
      payment = await db.payment.create({
        data: { bookingId: booking.id, amount: subDec(toDec(booking.amount), toDec(booking.discountAmount)), currency: 'USD', status: 'PENDING' },
      })
    }
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        ...(stripeIds.sessionId ? { stripeSessionId: stripeIds.sessionId } : {}),
        ...(stripeIds.paymentIntentId ? { stripePaymentIntentId: stripeIds.paymentIntentId, stripeChargeId: stripeIds.chargeId || stripeIds.paymentIntentId } : {}),
      },
    })

    const paidAmount = subDec(toDec(booking.amount), toDec(booking.discountAmount))
    const platformCut = toDec(booking.commissionAmount)
    const providerNet = toDec(booking.providerNetAmount)
    const affiliateCommission = toDec(booking.affiliateAmount)

    // Resolve provider userId
    let providerUserId: string | null = null
    if (booking.providerType === 'DOCTOR' && booking.doctorId) providerUserId = booking.doctor?.user?.id ?? null
    else if (booking.providerType === 'HOSPITAL' && booking.hospitalId) providerUserId = booking.hospital?.user?.id ?? null
    else if (booking.providerType === 'HOTEL' && booking.hotelId) providerUserId = booking.hotel?.user?.id ?? null
    else if (booking.providerType === 'TRANSLATOR' && booking.translatorId) providerUserId = booking.translator?.user?.id ?? null

    // Ledger entries — real money has arrived at this point (verified with Stripe).
    await db.ledgerEntry.createMany({
      data: [
        {
          type: 'PATIENT_CHARGE',
          bookingId: booking.id,
          paymentId: payment.id,
          amount: toDec(paidAmount),
          description: `Payment for ${providerNameOf(booking)}${booking.promoCode ? ` (promo: ${booking.promoCode.code})` : ''}`,
        },
        {
          type: 'COMMISSION',
          bookingId: booking.id,
          paymentId: payment.id,
          amount: toDec(platformCut),
          description: `Platform commission (${booking.commissionRate}%)`,
        },
        ...(providerUserId
          ? [{
              type: 'PROVIDER_CREDIT',
              bookingId: booking.id,
              paymentId: payment.id,
              userId: providerUserId,
              amount: toDec(providerNet),
              description: 'Provider credit (pending until service completion)',
            }]
          : []),
        ...(booking.affiliateId && parseFloat(affiliateCommission) > 0
          ? [{
              type: 'AFFILIATE_COMMISSION',
              bookingId: booking.id,
              paymentId: payment.id,
              userId: booking.affiliateId,
              amount: toDec(affiliateCommission),
              description: 'Affiliate commission for referral',
            }]
          : []),
      ] as any,
    })

    // Affiliate aggregate + click status
    if (booking.affiliateId && parseFloat(affiliateCommission) > 0) {
      const aff = await db.affiliate.findUnique({ where: { userId: booking.affiliateId } })
      if (aff) {
        await db.affiliate.update({
          where: { userId: booking.affiliateId },
          data: {
            totalBookings: { increment: 1 },
            totalEarnings: mulDec('1', addStrings(aff.totalEarnings, affiliateCommission)),
            pendingBalance: addStrings(aff.pendingBalance, affiliateCommission),
          },
        })
        await db.affiliateClick.updateMany({
          where: { affiliateId: aff.id, referredUserId: booking.patientId, status: 'SIGNED_UP' },
          data: { status: 'BOOKED', bookingId: booking.id, commissionAmount: affiliateCommission, convertedAt: new Date() },
        })
      }
    }

    // Notifications
    const pName = providerNameOf(booking)
    const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(booking.startDate))
    await notify({
      userId: booking.patientId,
      type: 'booking_created',
      title: 'Booking confirmed!',
      body: `Your booking with ${pName} on ${when} is confirmed. Payment received.`,
      link: 'bookings',
      meta: { bookingId: booking.id, amount: toDec(paidAmount) },
    })
    if (providerUserId) {
      await notify({
        userId: providerUserId,
        type: 'booking_created',
        title: 'New booking received',
        body: `${booking.patient.name || 'A patient'} booked a visit on ${when}. Paid.`,
        link: 'appointments',
        meta: { bookingId: booking.id, amount: toDec(providerNet) },
      })
    }

    // Confirmation emails
    try {
      const { sendEmail, bookingConfirmationEmail } = await import('@/lib/email')
      if (booking.patient.email) {
        const tpl = bookingConfirmationEmail(booking.patient.name || 'Patient', pName, when, toDec(paidAmount), booking.visitType)
        await sendEmail({ to: booking.patient.email, subject: tpl.subject, html: tpl.html })
      }
      const providerEmail = booking.doctor?.user?.email || booking.hospital?.user?.email || booking.hotel?.user?.email || booking.translator?.user?.email
      if (providerEmail) {
        const tpl = bookingConfirmationEmail(pName, booking.patient.name || 'Patient', when, toDec(booking.amount), booking.visitType)
        await sendEmail({ to: providerEmail, subject: tpl.subject, html: tpl.html })
      }
    } catch (e) {
      console.error('[finalizePaidBooking] email failed (non-fatal):', e)
    }

    return { finalized: true, alreadyDone: false }
  } catch (err) {
    // Roll back the optimistic CONFIRMED flip so the webhook can retry cleanly.
    await db.booking.updateMany({ where: { id: booking.id, status: 'CONFIRMED', payment: { status: { not: 'SUCCEEDED' } } }, data: { status: 'PENDING' } }).catch(() => {})
    throw err
  }
}

function providerNameOf(b: Booking & any): string {
  return b.doctor?.user?.name || b.hospital?.name || b.hotel?.name || b.translator?.user?.name || 'Provider'
}

function addStrings(a: string | null | undefined, b: string): string {
  return (parseFloat(a || '0') + parseFloat(b)).toFixed(2)
}

/**
 * finalizePaidItinerary — same contract as finalizePaidBooking but for a whole
 * itinerary (one Checkout Session covering N bookings). Idempotent per
 * booking; only bookings still PENDING are processed.
 */
export async function finalizePaidItinerary(itineraryId: string, stripeIds: { sessionId?: string; paymentIntentId?: string; chargeId?: string }): Promise<{ finalizedCount: number }> {
  const itinerary = await db.itinerary.findUnique({
    where: { id: itineraryId },
    include: { items: true },
  })
  if (!itinerary) return { finalizedCount: 0 }

  const bookings = await db.booking.findMany({ where: { itineraryId, status: 'PENDING' } })
  let count = 0
  for (const b of bookings) {
    const r = await finalizePaidBooking(b.id, stripeIds)
    if (r.finalized) count++
  }
  return { finalizedCount: count }
}
