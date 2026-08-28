'use client'

import { useEffect, useState } from 'react'
import { useApi, apiPost } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/shared/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/money'

/**
 * Checkout page — /checkout/[bookingId]
 *
 * Professional payment screen for a single booking:
 *   • Order summary (provider, service, date, price breakdown incl. promo)
 *   • Secure-payment reassurance + Stripe branding
 *   • "Pay now" → POST /api/checkout/session → redirect to Stripe hosted
 *     checkout. Booking is confirmed server-side after verified payment
 *     (confirm endpoint + webhook). No card data ever touches this app.
 */

type CheckoutBooking = {
  id: string
  providerType: 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
  // Migration Plan v3: full modality set (legacy ONLINE kept for historical rows)
  visitType: 'IN_PERSON' | 'ONLINE' | 'VIDEO' | 'CHAT'
  startDate: string
  endDate?: string | null
  amount: string
  discountAmount: string
  status: string
  service?: { name: string } | null
  doctor?: { user: { name: string }, specialty?: string } | null
  hospital?: { name: string } | null
  hotel?: { name: string } | null
  translator?: { user: { name: string } } | null
  payment?: { status: string; stripeSessionId?: string | null } | null
}

const PROVIDER_LABEL: Record<string, string> = {
  DOCTOR: 'Doctor', HOSPITAL: 'Hospital', HOTEL: 'Hotel / Suite', TRANSLATOR: 'Translator',
}

export function CheckoutClient({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  // Role-aware fetch of the patient's unpaid bookings; find the one being checked out.
  const bookingsApi = useApi<{ bookings: CheckoutBooking[] }>('/api/bookings?status=PENDING')
  const [paying, setPaying] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<{ url: string } | null>(null)

  const booking = bookingsApi.data?.bookings?.find((b) => b.id === bookingId)

  async function startPayment() {
    if (!booking) return
    setPaying(true)
    try {
      const res = await apiPost<{ sessionId: string; url: string }>('/api/checkout/session', { bookingId })
      setSessionInfo(res)
      // Redirect to Stripe-hosted checkout
      window.location.href = res.url
    } catch (e: any) {
      toast.error(e.message || 'Could not start checkout')
      setPaying(false)
    }
  }

  if (bookingsApi.loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Icon name="search_off" size={40} className="text-muted-foreground" />
            <p className="font-medium">Booking not found or not awaiting payment.</p>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>Back to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const providerName =
    booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'
  const total = parseFloat(booking.amount) - parseFloat(booking.discountAmount || '0')

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon name="lock" size={18} fill className="text-emerald-600" />
          <h1 className="text-2xl font-semibold tracking-tight">Secure checkout</h1>
        </div>
        <p className="text-sm text-muted-foreground">Complete your payment to confirm this booking. Payments are processed securely by Stripe.</p>
      </header>

      {/* Order summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><Icon name="receipt_long" size={18} fill /> Order summary</span>
            <Badge variant="secondary">{PROVIDER_LABEL[booking.providerType]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{providerName}</p>
              <p className="text-sm text-muted-foreground">
                {booking.service?.name || MODALITY_LABELS[booking.visitType]}
                {booking.doctor?.specialty ? ` · ${booking.doctor.specialty}` : ''}
              </p>
            </div>
            <span className="whitespace-nowrap font-medium tabular-nums">{formatCurrency(booking.amount)}</span>
          </div>

          <Separator />

          <div className="space-y-1.5 text-sm">
            <Row label="Date" value={new Date(booking.startDate).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })} />
            {booking.endDate && (
              <Row label="Check-out" value={new Date(booking.endDate).toLocaleDateString(undefined, { dateStyle: 'medium' })} />
            )}
            <Row label="Visit type" value={MODALITY_LABELS[booking.visitType]} />
            <Row label="Booking reference" value={<code className="rounded bg-muted px-1.5 py-0.5 text-xs">{booking.id.slice(-8).toUpperCase()}</code>} />
          </div>

          <Separator />

          {/* Price breakdown */}
          <div className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatCurrency(booking.amount)} />
            {parseFloat(booking.discountAmount || '0') > 0 && (
              <Row label="Promo discount" value={`− ${formatCurrency(booking.discountAmount)}`} accent="text-emerald-600" />
            )}
            <div className="flex items-center justify-between pt-2 text-base font-semibold">
              <span>Total due</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment action */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Icon name="verified_user" size={16} className="text-emerald-600" /> Card data is handled entirely by Stripe — we never see it.</li>
            <li className="flex items-center gap-2"><Icon name="event_available" size={16} className="text-primary" /> Your slot is held for 30 minutes during checkout.</li>
            <li className="flex items-center gap-2"><Icon name="undo" size={16} /> Free cancellation applies per the provider&apos;s policy.</li>
          </ul>
          <Button className="w-full h-12 text-base rounded-full" disabled={paying} onClick={startPayment}>
            {paying ? (
              <><Icon name="hourglass_top" size={18} className="animate-spin" /> Redirecting to secure payment…</>
            ) : (
              <><Icon name="lock" size={18} fill /> Pay {formatCurrency(total)} securely</>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">Powered by <span className="font-semibold">stripe</span></p>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <Icon name="arrow_back" size={16} /> Cancel and go back
        </Button>
      </div>
    </div>
  )
}

// Canonical display labels per visitType. ONLINE is the historical alias of
// VIDEO — legacy bookings keep their familiar "Online consultation" label.
const MODALITY_LABELS: Record<string, string> = {
  VIDEO: 'Video consultation',
  CHAT: 'Chat consultation',
  ONLINE: 'Online consultation',
  IN_PERSON: 'In-person visit',
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${accent || ''}`}>{value}</span>
    </div>
  )
}
