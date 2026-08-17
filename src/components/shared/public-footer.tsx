import Link from 'next/link'
import { db } from '@/lib/db'

/**
 * PublicFooter — unified public-site footer for SSR pages under /{locale}/...
 *
 * Reads `footerConfig` from SiteSetting (optional JSON with custom links).
 * Falls back to a default set of links (Doctors, Hospitals, Blog, About) +
 * copyright.
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

const DEFAULT_COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: 'Providers',
    links: [
      { label: 'Doctors', link: '/{locale}/doctors' },
      { label: 'Hospitals', link: '/{locale}/hospitals' },
      { label: 'Hotels', link: '/{locale}/hotels' },
      { label: 'Translators', link: '/{locale}/translators' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', link: '/{locale}/blog' },
      { label: 'About', link: '/{locale}/about' },
      { label: 'FAQ', link: '/{locale}/faq' },
      { label: 'Contact', link: '/{locale}/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', link: '/{locale}/terms' },
      { label: 'Privacy Policy', link: '/{locale}/privacy' },
    ],
  },
]

export async function PublicFooter({ locale }: { locale: string }) {
  const configRow = await db.siteSetting.findUnique({ where: { key: 'footerConfig' } })
  const config = parseFooterConfig(configRow?.value)
  const columns = config?.columns?.length ? config.columns : DEFAULT_COLUMNS
  const year = new Date().getFullYear()
  const copyright = config?.copyright || `© ${year} Wishubest — Global Medical Tourism Marketplace`

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
              Global Medical Tourism Marketplace — Compare and book verified providers worldwide.
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
          <p className="text-center text-xs text-muted-foreground">{copyright}</p>
        </div>
      </div>
    </footer>
  )
}
