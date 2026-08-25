import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { error, handleError } from '@/lib/api'
import { arePaymentsEnabled, retrieveCheckoutSession } from '@/lib/stripe'
import { finalizePaidBooking } from '@/lib/payment-finalizer'

export const dynamic = 'force-dynamic'

/**
 * GET /api/checkout/confirm?session_id=cs_...
 *
 * Stripe redirects the patient here after a successful hosted checkout.
 * The session id is verified SERVER-SIDE with Stripe before anything is
 * confirmed — the redirect itself is never trusted. The authoritative path
 * is the webhook; this endpoint gives the patient instant confirmation.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')
    if (!sessionId) return error(400, 'session_id required')

    const cs = await retrieveCheckoutSession(sessionId)
    if (!cs) return error(404, 'Checkout session not found')

    const bookingId = (cs.metadata?.bookingId) || ''
    if (!bookingId) return error(400, 'Session has no booking reference')

    const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, patientId: true, status: true } })
    if (!booking || booking.patientId !== session.id) return error(404, 'Booking not found')

    // Verify payments are live (protects against confirming during an outage window)
    if (!(await arePaymentsEnabled()) && cs.payment_status !== 'paid') {
      return error(503, 'Online payments are not yet available.')
    }

    if (cs.payment_status === 'paid') {
      const pi = typeof cs.payment_intent === 'string' ? null : cs.payment_intent
      await finalizePaidBooking(booking.id, {
        sessionId: cs.id,
        paymentIntentId: pi?.id,
        chargeId: pi?.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge.id : undefined,
      })
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
      return Response.redirect(`${origin}/checkout/success?bookingId=${booking.id}`, 303)
    }

    if (cs.payment_status === 'unpaid') {
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
      return Response.redirect(`${origin}/checkout/pending?bookingId=${booking.id}`, 303)
    }

    return error(402, `Payment status: ${cs.payment_status}`)
  } catch (e) { return handleError(e) }
}
