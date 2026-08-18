import Link from 'next/link'
import { db } from '@/lib/db'
import { ssrT } from '@/lib/ssr-i18n'
import { CookiePreferencesButton } from '@/components/shared/cookie-preferences-button'

/**
 * PublicFooter — unified public-site footer for SSR pages under /{locale}/...
 *
 * All default labels are translated via ssrT(locale, key, fallback).
 * Admin can override with a `footerConfig` SiteSetting (single JSON for
 * all locales — custom config is NOT translated, only the defaults are).
 */
type FooterLink = { label: string; link: string }
type FooterConfig = {
  columns?: Array<{ title: string; links: FooterLink[] }>
  copyright?: string
}

function parseFooterConfig(json: string | null | undefined): FooterConfig | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return {
      columns: Array.isArray(parsed.columns) ? parsed.columns : undefined,
      copyright: typeof parsed.copyright === 'string' ? parsed.copyright : undefined,
    }
  } catch {
    return null
  }
}

/** Build the default footer columns with i18n-translated labels. */
function getDefaultColumns(locale: string): Array<{ title: string; links: FooterLink[] }> {
  return [
    {
      title: ssrT(locale, 'footer.providers', 'Providers'),
      links: [
        { label: ssrT(locale, 'public.verifiedDoctors', 'Doctors'), link: '/{locale}/doctors' },
        { label: ssrT(locale, 'public.verifiedHospitals', 'Hospitals'), link: '/{locale}/hospitals' },
        { label: ssrT(locale, 'footer.hotels', 'Hotels'), link: '/{locale}/hotels' },
        { label: ssrT(locale, 'footer.translators', 'Translators'), link: '/{locale}/translators' },
      ],
    },
    {
      title: ssrT(locale, 'footer.resources', 'Resources'),
      links: [
        { label: ssrT(locale, 'public.blogTitle', 'Blog'), link: '/{locale}/blog' },
        { label: ssrT(locale, 'footer.about', 'About'), link: '/{locale}/about' },
        { label: ssrT(locale, 'footer.faq', 'FAQ'), link: '/{locale}/faq' },
        { label: ssrT(locale, 'footer.contact', 'Contact'), link: '/{locale}/contact' },
      ],
    },
    {
      title: ssrT(locale, 'footer.legal', 'Legal'),
      links: [
        { label: ssrT(locale, 'footer.terms', 'Terms of Service'), link: '/{locale}/terms' },
        { label: ssrT(locale, 'footer.privacy', 'Privacy Policy'), link: '/{locale}/privacy' },
      ],
    },
  ]
}

export async function PublicFooter({ locale }: { locale: string }) {
  const configRow = await db.siteSetting.findUnique({ where: { key: 'footerConfig' } })
  const config = parseFooterConfig(configRow?.value)
  const defaultCols = getDefaultColumns(locale)
  const columns = config?.columns?.length ? config.columns : defaultCols
  const year = new Date().getFullYear()
  const copyright = config?.copyright || `© ${year} Wishubest — ${ssrT(locale, 'footer.copyrightSuffix', 'Global Medical Tourism Marketplace')}`

  return (
    <footer className="border-t border-divider bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 24 }} aria-hidden>
                monitor_heart
              </span>
              <span>Wishubest</span>
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              {ssrT(locale, 'footer.brandDesc', 'Global Medical Tourism Marketplace — Compare and book verified providers worldwide.')}
            </p>
          </div>

          {/* Link columns */}
          {columns.map((col, idx) => (
            <div key={idx}>
              <p className="text-sm font-semibold text-foreground">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link, linkIdx) => {
                  const href = link.link.replace('{locale}', locale)
                  return (
                    <li key={linkIdx}>
                      <Link
                        href={href}
                        className="text-sm text-muted-foreground transition-colors hover:text-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 border-t border-divider pt-6">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-center text-xs text-muted-foreground">{copyright}</p>
            <CookiePreferencesButton />
          </div>
        </div>
      </div>
    </footer>
  )
}
