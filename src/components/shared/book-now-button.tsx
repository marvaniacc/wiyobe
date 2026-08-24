'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/shared/icon'
import { useApp } from '@/stores/app-store'
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
 * Always routes to /dashboard?section=browse&provider={id}&type={TYPE}.
 * The dashboard owns the auth decision server-side (/api/auth/session):
 *   - authenticated → browse section opens the booking dialog prefilled
 *   - unauthenticated → redirected to /{locale}/login?redirect=<back-here>
 *     (previously the button probed the session itself and could send an
 *     authenticated user to login on a transient/failed probe — the
 *     "clicked Book now and got signed out" bug).
 */
export function BookNowButton({
  locale,
  providerId,
  providerType,
  variant = 'default',
  className = '',
}: BookNowButtonProps) {
  const router = useRouter()
  const loc = locale as Locale
  const t = (k: string, f: string) => translate(loc, k, f)

  function handleClick() {
    const params = new URLSearchParams()
    if (providerId) params.set('provider', providerId)
    if (providerType) params.set('type', providerType.toUpperCase())
    const qs = params.toString()
    const target = `/dashboard?section=browse${qs ? `&${qs}` : ''}`

    if (window.location.pathname === '/dashboard') {
      // Already inside the SPA (e.g. the ?profile= public-profile view):
      // router.push to the same route would NOT remount the dashboard or
      // re-run the ?section handler, leaving the button feeling dead.
      // Transition the view directly and keep the URL (with prefill params)
      // in sync for BrowseSection's auto-book effect and the back button.
      window.history.pushState({ appView: 'dashboard', section: 'browse' }, '', target)
      useApp.getState().goDashboard('browse')
      return
    }
    router.push(target)
  }

  if (variant === 'public-profile') {
    return (
      <Button
        size="lg"
        className={`w-full gap-2 ${className}`}
        onClick={handleClick}
      >
        <Icon name="event_available" size={18} />
        {t('common.bookNow', 'Book now')}
      </Button>
    )
  }

  // Default variant — for provider detail pages
  return (
    <button
      onClick={handleClick}
      className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 ${className}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
        event_available
      </span>
      {t('common.bookNow', 'Book now')}
    </button>
  )
}
