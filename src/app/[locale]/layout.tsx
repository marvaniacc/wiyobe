import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar'] as const
const RTL_LOCALES = ['fa', 'ar']

type LocaleLayoutProps = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

/**
 * Generate basic metadata for locale-prefixed pages.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return {
    title: {
      default: 'Wishubest — Global Medical Tourism Marketplace',
      template: '%s — Wishubest',
    },
    description: 'Compare and book verified doctors, hospitals, accommodations and translators worldwide.',
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
