import { db } from '@/lib/db'
import { error } from '@/lib/api'
import { getStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/webhook
 *
 * Signature-verified Stripe webhook receiver. Reconciles payment state that
 * the optimistic booking flow cannot know about (asynchronous failures,
 * disputes, external refunds).
 *
 * Setup (Stripe Dashboard → Developers → Webhooks):
 *   1. Endpoint: https://wishubest.com/api/stripe/webhook
 *   2. Events: payment_intent.succeeded, payment_intent.payment_failed,
 *              charge.refunded
 *   3. Set STRIPE_WEBHOOK_SECRET (whsec_...) in the environment.
 *
 * All handlers are idempotent — Stripe retries deliveries.
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
      case 'payment_intent.succeeded': {
        const pi = event.data.object as import('stripe').Stripe.PaymentIntent
        await db.payment.updateMany({
          where: { stripeChargeId: pi.id, status: { not: 'REFUNDED' } },
          data: { status: 'SUCCEEDED' },
        })
        break
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as import('stripe').Stripe.PaymentIntent
        await db.payment.updateMany({
          where: { stripeChargeId: pi.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
        break
      }
      case 'charge.refunded': {
        const ch = event.data.object as import('stripe').Stripe.Charge
        if (ch.payment_intent) {
          const fullyRefunded = ch.amount_refunded >= ch.amount
          await db.payment.updateMany({
            where: { stripeChargeId: ch.payment_intent as string },
            data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
          })
        }
        break
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break
    }
  } catch (e) {
    // Return 500 so Stripe retries; handler is idempotent.
    console.error('[stripe-webhook] handler error:', e)
    return error(500, 'Webhook handler failed')
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
