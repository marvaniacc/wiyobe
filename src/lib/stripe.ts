import Stripe from 'stripe'

// ============================================================================
// Stripe — real payment workflow via Stripe Checkout (hosted).
//
// Commercial activation model:
//   • STRIPE_SECRET_KEY  — the merchant account's secret key. The ONLY secret
//     the operator must supply; until it exists every paid flow fails closed.
//   • paymentsEnabled SiteSetting — admin kill-switch. Payments are live only
//     when BOTH the key is configured AND an admin has enabled the toggle.
//
// There are NO mock charges anywhere in this file or in the booking flow.
// Without activation, POST /api/bookings refuses to charge; patients can
// still create bookings that remain PENDING_PAYMENT until checkout completes.
// ============================================================================

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe | null {
  if (stripeInstance) return stripeInstance
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_MERCHANT_CODE || ''
  if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) return null
  stripeInstance = new Stripe(key, {
    apiVersion: '2025-01-27.acacia' as any,
    typescript: true,
  })
  return stripeInstance
}

export function isStripeConfigured(): boolean {
  return getStripe() !== null
}

/** Admin kill-switch — read from DB so no redeploy is needed to go live. */
export async function arePaymentsEnabled(): Promise<boolean> {
  if (!isStripeConfigured()) return false
  const { db } = await import('@/lib/db')
  const setting = await db.siteSetting.findUnique({ where: { key: 'paymentsEnabled' } })
  return setting?.value === 'true'
}

/**
 * Create a Stripe Checkout Session for a booking.
 * The patient pays on Stripe-hosted checkout.pay.stripe.com — no PCI scope on
 * our servers, no publishable key / Elements wiring required.
 */
export async function createCheckoutSession(opts: {
  bookingId: string
  amount: number            // major units (dollars)
  description: string
  customerEmail?: string
  successUrl: string        // must contain {CHECKOUT_SESSION_ID}
  cancelUrl: string
  metadata?: Record<string, string>
}): Promise<{ id: string; url: string; expiresAt: Date } | null> {
  const stripe = getStripe()
  if (!stripe) return null

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(opts.amount * 100), // cents
          product_data: { name: opts.description.slice(0, 300) },
        },
      },
    ],
    ...(opts.customerEmail ? { customer_email: opts.customerEmail } : {}),
    metadata: { bookingId: opts.bookingId, ...opts.metadata },
    payment_intent_data: {
      description: opts.description.slice(0, 300),
      metadata: { bookingId: opts.bookingId },
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30-minute hold
  })

  return {
    id: session.id,
    url: session.url!,
    expiresAt: new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + 1800) * 1000),
  }
}

export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripe()
  if (!stripe) return null
  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  })
}

// Refund a payment (by PaymentIntent id)
export async function refundPayment(paymentIntentId: string, amount?: number): Promise<{ id: string; status: string; amount: number } | null> {
  const stripe = getStripe()
  if (!stripe) return null

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount ? { amount: Math.round(amount * 100) } : {}), // partial refund if amount specified
  })

  return { id: refund.id, status: refund.status ?? 'unknown', amount: refund.amount / 100 }
}

export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
  const stripe = getStripe()
  if (!stripe) return null
  return await stripe.paymentIntents.retrieve(paymentIntentId)
}
