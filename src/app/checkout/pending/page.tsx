import { StatusPage } from '@/components/checkout/status-page'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Payment Pending — Wishubest', robots: { index: false } }

export default async function PendingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const bookingId = typeof sp.bookingId === 'string' ? sp.bookingId : undefined
  return <StatusPage variant="pending" bookingId={bookingId} />
}
