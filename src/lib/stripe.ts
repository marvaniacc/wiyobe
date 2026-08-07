import Stripe from 'stripe'

// Initialize Stripe only if the secret key is configured
// In dev without keys, returns null and the booking flow uses mock charges
let stripeInstance: Stripe | null = null

export function getStripe(): Stripe | null {
  if (stripeInstance) return stripeInstance
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || key.startsWith('sk_test_') === false && key.startsWith('sk_live_') === false) {
    return null
  }
  stripeInstance = new Stripe(key, {
    apiVersion: '2025-01-27.acacia' as any,
    typescript: true,
  })
  return stripeInstance
}

export function isStripeConfigured(): boolean {
  return getStripe() !== null
}

// Create a PaymentIntent for a booking
export async function createPaymentIntent(amount: number, currency: string = 'usd', metadata?: Record<string, string>): Promise<{ id: string; clientSecret: string } | null> {
  const stripe = getStripe()
  if (!stripe) return null

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Stripe uses cents
    currency,
    automatic_payment_methods: { enabled: true },
    metadata,
  })

  return { id: intent.id, clientSecret: intent.client_secret! }
}

// Create a charge directly (server-side, no client confirmation needed)
export async function createCharge(amount: number, currency: string = 'usd', description: string, metadata?: Record<string, string>): Promise<{ id: string; status: string } | null> {
  const stripe = getStripe()
  if (!stripe) return null

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    description,
    metadata,
    automatic_payment_methods: { enabled: true },
    confirm: true,
    // In production, you'd pass a payment_method or customer's saved payment method
    // For now, this creates an off-session charge requiring a payment method on file
  })

  return { id: paymentIntent.id, status: paymentIntent.status }
}

// Refund a payment
export async function refundPayment(paymentIntentId: string, amount?: number): Promise<{ id: string; status: string; amount: number } | null> {
  const stripe = getStripe()
  if (!stripe) return null

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount ? { amount: Math.round(amount * 100) } : {}), // partial refund if amount specified
  })

  return { id: refund.id, status: refund.status, amount: refund.amount / 100 }
}

// Retrieve a payment intent to check status
export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
  const stripe = getStripe()
  if (!stripe) return null
  return await stripe.paymentIntents.retrieve(paymentIntentId)
}
