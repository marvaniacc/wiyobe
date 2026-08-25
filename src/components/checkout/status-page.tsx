'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/shared/icon'
import { useRouter } from 'next/navigation'

const CONFIG: Record<string, { icon: string; color: string; title: string; body: string; cta: string; href: string }> = {
  success: {
    icon: 'check_circle',
    color: 'text-emerald-600',
    title: 'Payment received — booking confirmed!',
    body: 'A confirmation email is on its way. You can view this booking anytime in your dashboard.',
    cta: 'Go to my bookings',
    href: '/dashboard',
  },
  pending: {
    icon: 'hourglass_top',
    color: 'text-amber-600',
    title: 'Payment is processing',
    body: 'Your payment is being confirmed with the payment provider. This page will not update automatically — check your bookings in a few minutes.',
    cta: 'Go to my bookings',
    href: '/dashboard',
  },
  cancelled: {
    icon: 'cancel',
    color: 'text-red-500',
    title: 'Checkout cancelled',
    body: "No charge was made. Your booking is still reserved and awaiting payment — you can resume checkout whenever you're ready.",
    cta: 'Resume checkout',
    href: '',
  },
}

export function StatusPage({ variant, bookingId }: { variant: keyof typeof CONFIG; bookingId?: string }) {
  const router = useRouter()
  const cfg = CONFIG[variant]

  return (
    <div className="mx-auto max-w-md p-6 pt-20">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Icon name={cfg.icon} size={56} fill className={cfg.color} />
          <h1 className="text-xl font-semibold tracking-tight">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">{cfg.body}</p>
          <Button
            className="mt-2 rounded-full"
            onClick={() => router.push(variant === 'cancelled' && bookingId ? `/checkout/${bookingId}` : cfg.href)}
          >
            {variant === 'cancelled' && bookingId ? 'Resume checkout' : cfg.cta}
          </Button>
          {bookingId && (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              Ref: {bookingId.slice(-8).toUpperCase()}
            </code>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
