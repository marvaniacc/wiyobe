import { db } from '@/lib/db'
import { error } from '@/lib/api'
import { getStripe } from '@/lib/stripe'
import { finalizePaidBooking, finalizePaidItinerary } from '@/lib/payment-finalizer'

export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/webhook
 *
 * Signature-verified Stripe webhook receiver for the Checkout flow.
 *
 * Setup (Stripe Dashboard → Developers → Webhooks):
 *   1. Endpoint: https://wishubest.com/api/stripe/webhook
 *   2. Events: checkout.session.completed, checkout.session.expired,
 *      checkout.session.async_payment_succeeded,
 *      checkout.session.async_payment_failed,
 *      charge.refunded
 *   3. Set STRIPE_WEBHOOK_SECRET (whsec_...) in the environment.
 *
 * The webhook is the AUTHORITATIVE confirmation path; /api/checkout/confirm
 * is the instant UX shortcut. finalizePaidBooking is idempotent so both can
 * fire safely.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = req.headers.get('stripe-signature')
  const stripe = getStripe()
  if (!secret || !signature || !stripe) {
    return error(503, 'Stripe webhook is not configured')
  }

  const payload = await req.text()
  let event: import('stripe').Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret)
  } catch (err: any) {
    console.error('[stripe-webhook] signature verification failed:', err?.message)
    return error(400, 'Invalid signature')
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const cs = event.data.object as import('stripe').Stripe.Checkout.Session
        const bookingId = cs.metadata?.bookingId
        const itineraryId = cs.metadata?.itineraryId
        if (!bookingId && !itineraryId) break

        if (cs.payment_status === 'paid') {
          // Retrieve expanded to get the PaymentIntent + charge ids reliably.
          let piId: string | undefined
          let chargeId: string | undefined
          if (typeof cs.payment_intent === 'string') {
            piId = cs.payment_intent
            const pi = await stripe.paymentIntents.retrieve(piId)
            chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id
          } else if (cs.payment_intent) {
            piId = cs.payment_intent.id
            chargeId = typeof cs.payment_intent.latest_charge === 'string' ? cs.payment_intent.latest_charge : cs.payment_intent.latest_charge?.id
          }

          if (itineraryId) {
            await finalizePaidItinerary(itineraryId, { sessionId: cs.id, paymentIntentId: piId, chargeId })
          } else {
            await db.payment.updateMany({
              where: { bookingId, status: 'PENDING' },
              data: { stripeSessionId: cs.id, ...(piId ? { stripePaymentIntentId: piId, stripeChargeId: chargeId || piId } : {}) },
            })
            await finalizePaidBooking(bookingId!, { sessionId: cs.id, paymentIntentId: piId, chargeId })
          }
        }
        break
      }

      case 'checkout.session.expired': {
        const cs = event.data.object as import('stripe').Stripe.Checkout.Session
        const bookingId = cs.metadata?.bookingId
        if (!bookingId) break
        // Session expired without payment → release the hold.
        await db.payment.updateMany({
          where: { bookingId, stripeSessionId: cs.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
        break
      }

      case 'checkout.session.async_payment_failed': {
        const cs = event.data.object as import('stripe').Stripe.Checkout.Session
        const bookingId = cs.metadata?.bookingId
        if (!bookingId) break
        await db.payment.updateMany({
          where: { bookingId, stripeSessionId: cs.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
        break
      }

      case 'charge.refunded': {
        const ch = event.data.object as import('stripe').Stripe.Charge
        if (ch.payment_intent) {
          const piId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent.id
          const fullyRefunded = ch.amount_refunded >= ch.amount
          const payment = await db.payment.findFirst({ where: { OR: [{ stripePaymentIntentId: piId }, { stripeChargeId: piId }] } })
          if (payment) {
            await db.payment.update({
              where: { id: payment.id },
              data: {
                status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
                refundAmount: (ch.amount_refunded / 100).toFixed(2),
              },
            })
            if (fullyRefunded) {
              await db.booking.updateMany({ where: { id: payment.bookingId }, data: { status: 'REFUNDED' } })
            }
          }
        }
        break
      }
    }

    return json({ received: true })
  } catch (e: any) {
    console.error('[stripe-webhook] handler error:', e)
    return error(500, 'Webhook handler failed')
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}
