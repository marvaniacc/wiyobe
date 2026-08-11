import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar'] as const
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
    lang: locale,
  }
}

/**
 * Locale layout — validates the locale from the URL and sets the
 * `<html lang>` and `dir` attributes for accessibility and SEO.
 *
 * This layout wraps ALL public pages under `/{locale}/...`.
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
    <div lang={locale} dir={dir} className="min-h-screen bg-background">
      {children}
    </div>
  )
}
