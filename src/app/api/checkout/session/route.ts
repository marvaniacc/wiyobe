import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { arePaymentsEnabled, createCheckoutSession } from '@/lib/stripe'
import { toDec, subDec } from '@/lib/money'
import { z } from 'zod'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

const schema = z.object({
  // Either an existing PENDING_PAYMENT booking, or the full booking payload
  bookingId: z.string().optional(),
})

/**
 * POST /api/checkout/session
 *
 * Creates (or reuses) a Stripe Checkout Session for a booking.
 *
 * Flow:
 *   1. If `bookingId` given, the booking must belong to this patient and be
 *      in PENDING_PAYMENT status with no active session.
 *   2. A Payment row is created/updated with the Checkout Session id.
 *   3. Returns the hosted `url` — the client redirects to it.
 *
 * The booking is only confirmed by /api/checkout/confirm or the Stripe
 * webhook after Stripe reports payment success. Nothing here credits any
 * balance — that happens exclusively on verified success.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Only patients can pay for bookings')

    if (!(await arePaymentsEnabled())) {
      return error(503, 'Online payments are not yet available. Please contact support.')
    }

    const body = await parseBody(req, schema)
    if (!body.bookingId) return error(400, 'bookingId is required')

    const booking = await db.booking.findUnique({
      where: { id: body.bookingId },
      include: { payment: true, service: true, doctor: { include: { user: { select: { name: true } } } }, hospital: { select: { name: true } }, hotel: { select: { name: true } }, translator: { include: { user: { select: { name: true } } } }, promoCode: { select: { code: true } } },
    })
    if (!booking || booking.patientId !== session.id) return error(404, 'Booking not found')
    if (booking.status !== 'PENDING') return error(409, `Booking is ${booking.status} — only unpaid bookings can be checked out`)

    const providerName =
      booking.doctor?.user?.name ||
      booking.hospital?.name ||
      booking.hotel?.name ||
      booking.translator?.user?.name || 'Provider'

    // Amount the patient owes = list amount − snapshot discount
    const owed = subDec(toDec(booking.amount), toDec(booking.discountAmount))
    if (parseFloat(owed) <= 0) return error(400, 'This booking has no amount due')

    // Reuse an open session if one exists and hasn't expired
    if (booking.payment?.stripeSessionId && booking.payment.status === 'PENDING') {
      try {
        const { retrieveCheckoutSession } = await import('@/lib/stripe')
        const existing = await retrieveCheckoutSession(booking.payment.stripeSessionId)
        if (existing && existing.status === 'open' && existing.url) {
          return json({ sessionId: existing.id, url: existing.url, reused: true })
        }
      } catch {
        // fall through and create a fresh one
      }
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin

    const cs = await createCheckoutSession({
      bookingId: booking.id,
      amount: parseFloat(owed),
      description: `Wishubest booking — ${providerName}${booking.service ? ` (${booking.service.name})` : ''}`,
      customerEmail: session.email,
      successUrl: `${origin}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/checkout/cancelled?bookingId=${booking.id}`,
      metadata: { patientId: session.id },
    })
    if (!cs) return error(503, 'Payment provider unavailable. Please contact support.')

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    // Upsert the PENDING payment record bound to the session
    if (booking.payment) {
      await db.payment.update({
        where: { id: booking.payment.id },
        data: { stripeSessionId: cs.id, amount: owed, currency: 'USD', status: 'PENDING' },
      })
    } else {
      await db.payment.create({
        data: {
          bookingId: booking.id,
          stripeSessionId: cs.id,
          amount: owed,
          currency: 'USD',
          status: 'PENDING',
        },
      })
    }

    return json({ sessionId: cs.id, url: cs.url, expiresAt: expiresAt.toISOString() })
  } catch (e) { return handleError(e) }
}
