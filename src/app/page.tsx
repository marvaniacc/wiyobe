'use client'
import { useEffect } from 'react'
import { useApp } from '@/stores/app-store'
import { isRTL, type Locale } from '@/lib/i18n'
import { LandingPage } from '@/components/landing/landing'
import { AuthScreen } from '@/components/auth/auth-screen'
import { DashboardShell } from '@/components/shell/dashboard-shell'

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // if a session exists and we're on landing/auth, go to dashboard
  useEffect(() => {
    if (session && (view.name === 'landing' || view.name === 'auth')) {
      goDashboard('overview')
    }
    if (!session && view.name === 'dashboard') {
      useApp.getState().goLanding()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

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

  if (!session) {
    if (view.name === 'auth') return <AuthScreen />
    return <LandingPage />
  }

  return <DashboardShell />
}
