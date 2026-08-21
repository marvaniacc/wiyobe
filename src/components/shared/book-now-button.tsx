'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/shared/icon'
import { translate, type Locale } from '@/lib/i18n'

type BookNowButtonProps = {
  locale: string
  providerId?: string
  providerType?: string
  providerSlug?: string
  countrySlug?: string
  variant?: 'default' | 'public-profile'
  className?: string
}

/**
 * BookNowButton — smart booking button that handles auth state.
 *
 * Behavior:
 * 1. Checks if user is logged in (fetch /api/auth/session)
 * 2. If logged in → redirect to /dashboard?section=bookings&provider={id}
 *    (the dashboard's booking section will handle the provider prefill)
 * 3. If NOT logged in → redirect to /{locale}/login?redirect={currentPath}
 *    (user logs in, then returns to the provider page to book)
 *
 * Usage:
 *   <BookNowButton locale={locale} providerId={doctor.id} providerType="doctor" />
 *   <BookNowButton locale={locale} providerId={doctor.id} variant="public-profile" />
 */
export function BookNowButton({
  locale,
  providerId,
  providerType,
  variant = 'default',
  className = '',
}: BookNowButtonProps) {
  const router = useRouter()
  const [session, setSession] = useState<{ id: string; role: string } | null>(null)
  const [checked, setChecked] = useState(false)
  const loc = locale as Locale
  const t = (k: string, f: string) => translate(loc, k, f)

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.session) setSession(data.session)
      })
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [])

  function handleClick() {
    if (!checked) return

    if (session) {
      // Logged in → go to dashboard booking section with provider prefill
      const params = new URLSearchParams()
      if (providerId) params.set('provider', providerId)
      if (providerType) params.set('type', providerType)
      router.push(`/dashboard?section=bookings&${params.toString()}`)
    } else {
      // Not logged in → go to login with redirect back to current page
      const currentPath = window.location.pathname
      router.push(`/${locale}/login?redirect=${encodeURIComponent(currentPath)}`)
    }
  }

  if (variant === 'public-profile') {
    return (
      <Button
        size="lg"
        className={`w-full gap-2 ${className}`}
        onClick={handleClick}
        disabled={!checked}
      >
        <Icon name="event_available" size={18} />
        {checked ? t('common.bookNow', 'Book now') : '…'}
      </Button>
    )
  }

  // Default variant — for provider detail pages
  return (
    <button
      onClick={handleClick}
      disabled={!checked}
      className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 ${className}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
        event_available
      </span>
      {checked ? t('common.bookNow', 'Book now') : '…'}
    </button>
  )
}
