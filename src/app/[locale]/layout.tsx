import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { PublicHeader } from '@/components/shared/public-header'
import { PublicFooter } from '@/components/shared/public-footer'
import { CookieConsentBanner } from '@/components/shared/cookie-consent-banner'
import { getSiteSettings, normalizeHex } from '@/lib/site-settings'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const
const RTL_LOCALES = ['fa', 'ar']

type LocaleLayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

/**
 * Fetch site settings as a key-value map for use in metadata.
 */
async function getSiteSettingsMap(): Promise<Record<string, string>> {
  try {
    const settings = await db.siteSetting.findMany()
    const map: Record<string, string> = {}
    for (const s of settings) if (s.value != null) map[s.key] = s.value
    return map
  } catch {
    return {}
  }
}

/**
 * Generate metadata using dynamic Site Settings (siteName, defaultSeoTitle,
 * defaultSeoDescription). Falls back to hardcoded defaults if settings are
 * not configured.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const settings = await getSiteSettingsMap()

  const siteName = settings.siteName || 'Wishubest'
  const defaultSeoTitle = settings.defaultSeoTitle || `${siteName} — Global Medical Tourism Marketplace`
  const defaultSeoDescription = settings.defaultSeoDescription || 'Compare and book verified doctors, hospitals, accommodations and translators worldwide.'

  const robots = settings.allowSearchIndexing === 'false'
    ? { index: false as const, follow: false as const }
    : undefined

  return {
    title: {
      default: defaultSeoTitle,
      template: `%s — ${siteName}`,
    },
    description: defaultSeoDescription,
    ...(robots ? { robots } : {}),
  }
}

/**
 * Locale layout — validates the locale from the URL, sets `dir` for RTL
 * locales, and renders the SiteSetting-driven PublicHeader + PublicFooter
 * around all public pages under `/{locale}/...`.
 *
 * The `<html lang>` attribute is set by the root layout (src/app/layout.tsx)
 * based on the `x-locale` header forwarded by middleware.
 */
export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params
  const { headers } = await import('next/headers')
  const isAuthPage = (await headers()).get('x-auth-page') === '1'

  // Validate locale — return 404 if not supported
  if (!SUPPORTED_LOCALES.includes(locale as any)) {
    notFound()
  }

  const isRTL = RTL_LOCALES.includes(locale)
  const dir = isRTL ? 'rtl' : 'ltr'

  // Admin-configurable appearance — injected as CSS variable overrides so the
  // whole design system (background, primary, accent) follows without a rebuild.
  const s = await getSiteSettings()
  const bg = normalizeHex(s.bgColorLight)
  const primary = normalizeHex(s.primaryColor)
  const accent = normalizeHex(s.accentColor)
  const styleOverrides = (bg || primary || accent)
    ? `:root{${bg ? `--background:${bg};` : ''}${primary ? `--primary:${primary};--ring:${primary};--sidebar-primary:${primary};` : ''}${accent ? `--accent:${accent};` : ''}}`
    : undefined

  // Maintenance mode — non-admin visitors see a holding page.
  if (s.maintenanceMode === 'true') {
    let isAdmin = false
    try {
      const { getSession } = await import('@/lib/auth')
      const session = await getSession()
      isAdmin = session?.role === 'ADMIN'
    } catch { /* treat as visitor */ }
    if (!isAdmin) {
      return (
        <div dir={dir} className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 44 }} aria-hidden>engineering</span>
          <h1 className="text-xl font-semibold">{s.siteName}</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            We&apos;re performing scheduled maintenance. Please check back shortly.
          </p>
        </div>
      )
    }
  }

  // Auth pages (login / signup / forgot-password) render chromeless —
  // they bring their own centered layout and must fit the viewport.
  if (isAuthPage) {
    return (
      <div dir={dir} className="flex min-h-screen flex-col bg-background">
        {styleOverrides ? <style dangerouslySetInnerHTML={{ __html: styleOverrides }} /> : null}
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    )
  }

  return (
    <div dir={dir} className="flex min-h-screen flex-col bg-background">
      {styleOverrides ? <style dangerouslySetInnerHTML={{ __html: styleOverrides }} /> : null}
      <PublicHeader locale={locale} />
      <main className="flex-1">{children}</main>
      <PublicFooter locale={locale} />
      <CookieConsentBanner locale={locale} />
    </div>
  )
}
