import { CheckoutClient } from '@/components/checkout/checkout-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Secure Checkout — Wishubest',
  robots: { index: false },
}

export default async function CheckoutPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  return <CheckoutClient bookingId={bookingId} />
}
