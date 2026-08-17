import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { PublicHeader } from '@/components/shared/public-header'
import { PublicFooter } from '@/components/shared/public-footer'
import { CookieConsentBanner } from '@/components/shared/cookie-consent-banner'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const
const RTL_LOCALES = ['fa', 'ar']

type LocaleLayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

/**
 * Fetch site settings as a key-value map for use in metadata.
 */
async function getSiteSettings(): Promise<Record<string, string>> {
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
  const settings = await getSiteSettings()

  const siteName = settings.siteName || 'Wishubest'
  const defaultSeoTitle = settings.defaultSeoTitle || `${siteName} — Global Medical Tourism Marketplace`
  const defaultSeoDescription = settings.defaultSeoDescription || 'Compare and book verified doctors, hospitals, accommodations and translators worldwide.'

  return {
    title: {
      default: defaultSeoTitle,
      template: `%s — ${siteName}`,
    },
    description: defaultSeoDescription,
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

  // Validate locale — return 404 if not supported
  if (!SUPPORTED_LOCALES.includes(locale as any)) {
    notFound()
  }

  const isRTL = RTL_LOCALES.includes(locale)
  const dir = isRTL ? 'rtl' : 'ltr'

  return (
    <div dir={dir} className="flex min-h-screen flex-col bg-background">
      <PublicHeader locale={locale} />
      <main className="flex-1">{children}</main>
      <PublicFooter locale={locale} />
      <CookieConsentBanner locale={locale} />
    </div>
  )
}
