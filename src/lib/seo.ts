import type { Metadata } from 'next'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const

const PAGE_NAMES: Record<string, string> = {
  about: 'About',
  faq: 'FAQ',
  contact: 'Contact',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
}

/**
 * Build schema.org/BreadcrumbList JSON-LD for a static page under /{locale}/{page}.
 *
 * The breadcrumb is: Home ({locale}) → {Page name}.
 * Used to make static pages eligible for breadcrumb rich results in Google SERP.
 *
 * Returns a string (JSON.stringify) ready to be embedded in a
 * <script type="application/ld+json"> tag.
 */
export function buildBreadcrumbJsonLd(locale: string, page: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wishubest.com'
  const pageName = PAGE_NAMES[page] || page

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${baseUrl}/${locale}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: pageName,
        item: `${baseUrl}/${locale}/${page}`,
      },
    ],
  }

  return JSON.stringify(jsonLd)
}

/**
 * Build hreflang alternates for a static page, shared across the 5 static
 * pages (about/faq/contact/terms/privacy). Returns a Metadata.alternates
 * object with canonical + languages (5 locales + x-default).
 */
export function buildStaticAlternates(locale: string, page: string) {
  const staticPath = `/${page}`
  return {
    canonical: `/{locale}${staticPath}`,
    languages: Object.fromEntries([
      ...SUPPORTED_LOCALES.map((l) => [l, `/${l}${staticPath}`]),
      ['x-default', `/en${staticPath}`],
    ]),
  }
}
