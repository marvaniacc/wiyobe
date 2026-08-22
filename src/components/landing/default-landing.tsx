'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/stores/app-store'
import { isRTL, type Locale } from '@/lib/i18n'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { PublicProfilePage } from '@/components/public/public-profile'

/**
 * Default landing — the SPA shell that handles session bootstrapping and
 * the Zustand dashboard.
 *
 * Auth is NO LONGER handled here. Unauthenticated users are redirected to
 * /{locale} (the public SSR landing page). Authentication now happens on
 * public Custom Pages via the shortcode [[module:auth type="signup" role="X"]].
 *
 * This component ONLY renders the dashboard if the user is logged in.
 */
export function DefaultLanding() {
  const router = useRouter()
  const session = useApp((s) => s.session)
  const sessionLoading = useApp((s) => s.sessionLoading)
  const setSession = useApp((s) => s.setSession)
  const setSessionLoading = useApp((s) => s.setSessionLoading)
  const view = useApp((s) => s.view)
  const locale = useApp((s) => s.locale)
  const theme = useApp((s) => s.theme)
  const setLocale = useApp((s) => s.setLocale)
  const goDashboard = useApp((s) => s.goDashboard)
  const goPublicProfile = useApp((s) => s.goPublicProfile)

  // bootstrap session
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled) {
          if (data.session) {
            setSession(data.session)
            setLocale((data.session.preferredLanguage || 'en') as Locale)
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setSessionLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?profile=TYPE:ID query param for public profile sharing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const profileParam = params.get('profile')
    if (profileParam) {
      const [type, id] = profileParam.split(':')
      if (type && id) {
        goPublicProfile(id, type)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?ref=CODE affiliate referral tracking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (refCode) {
      // Store referral code for signup
      localStorage.setItem('mt_ref_code', refCode)
      // Track the click (fire and forget)
      fetch('/api/affiliate/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: refCode }),
      }).catch(() => {})
      // Clean URL (remove ref param)
      const newUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, document.title, newUrl)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // sync locale from session once
  useEffect(() => {
    if (session?.preferredLanguage) setLocale(session.preferredLanguage as Locale)
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // apply dir + theme to <html>
  useEffect(() => {
    const dir = isRTL(locale as Locale) ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', locale)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [locale, theme])

  // If a session exists and we're on landing, go to dashboard.
  // Check ?section= query param FIRST — if present (e.g. from Book now button),
  // go to that section instead of the default/last section.
  useEffect(() => {
    if (session && view.name === 'landing') {
      const params = new URLSearchParams(window.location.search)
      const sectionParam = params.get('section')
      if (sectionParam) {
        // Remove only the 'section' param — preserve provider/type
        // params so BrowseSection can auto-open the booking dialog.
        params.delete('section')
        const remaining = params.toString()
        const newUrl = remaining ? `${window.location.pathname}?${remaining}` : window.location.pathname
        window.history.replaceState({}, '', newUrl)
        goDashboard(sectionParam)
      } else {
        const lastSection = useApp.getState().lastSection
        goDashboard(lastSection || 'overview')
      }
    }
    // If no session, redirect to /en (the public SSR landing page)
    if (!session && !sessionLoading && view.name === 'dashboard') {
      router.push('/en')
    }
  }, [session, sessionLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Browser back button support
  useEffect(() => {
    if (view.name === 'dashboard') {
      window.history.pushState({ appView: view.name, section: view.section }, '')
    }

    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.appView === 'dashboard' && session) {
        useApp.getState().goDashboard(e.state.section || 'overview')
      } else if (session) {
        useApp.getState().goDashboard('overview')
      } else {
        router.push('/en')
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [view.name, view.name === 'dashboard' ? view.section : '', session]) // eslint-disable-line react-hooks/exhaustive-deps

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-divider border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  // Public profile is viewable without login
  if (view.name === 'public-profile') return <PublicProfilePage />

  // No session → redirect to /en (public SSR landing with shortcode-based auth)
  if (!session) {
    // Only redirect if we're not already on /dashboard — this prevents
    // infinite redirect loops. The actual redirect happens in the useEffect above.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-divider border-t-primary" />
          <p className="text-sm text-muted-foreground">Redirecting…</p>
        </div>
      </div>
    )
  }

  return <DashboardShell />
}
