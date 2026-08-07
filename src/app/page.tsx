'use client'
import { useEffect } from 'react'
import { useApp } from '@/stores/app-store'
import { isRTL, type Locale } from '@/lib/i18n'
import { LandingPage } from '@/components/landing/landing'
import { AuthScreen } from '@/components/auth/auth-screen'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { PublicProfilePage } from '@/components/public/public-profile'

export default function Home() {
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
        const res = await fetch('/api/auth/signup', { cache: 'no-store' })
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

  // if a session exists and we're on landing/auth, go to dashboard (unless viewing public profile)
  useEffect(() => {
    if (session && (view.name === 'landing' || view.name === 'auth')) {
      goDashboard('overview')
    }
    if (!session && view.name === 'dashboard') {
      useApp.getState().goLanding()
    }
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!session) {
    if (view.name === 'auth') return <AuthScreen />
    return <LandingPage />
  }

  return <DashboardShell />
}
