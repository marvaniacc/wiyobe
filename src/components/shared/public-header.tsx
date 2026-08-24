import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { ssrT } from '@/lib/ssr-i18n'
import { PublicAuthArea } from '@/components/shared/public-auth-area'

type NavLink = { label: string; link: string }
type HeaderConfig = {
  menuItems: NavLink[]
  ctaLabel: string
  ctaLink: string
}

function parseHeaderConfig(json: string | null | undefined): HeaderConfig | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return {
      menuItems: Array.isArray(parsed.menuItems) ? parsed.menuItems : [],
      ctaLabel: parsed.ctaLabel || '',
      ctaLink: parsed.ctaLink || '',
    }
  } catch {
    return null
  }
}

/**
 * PublicHeader — unified public-site header for SSR pages under /{locale}/...
 *
 * Reads headerConfigGuest / headerConfigLogged from SiteSetting to dynamically
 * render menu items and CTA button. Falls back to defaults if no config is set.
 *
 * Unauthenticated: Logo | Menu Items | Language | CTA Button
 * Authenticated:   Logo | Menu Items | Language | Avatar Dropdown
 */
export async function PublicHeader({ locale }: { locale: string }) {
  const session = await getSession()
  const isAuth = !!session

  // Read dynamic header config from SiteSetting — per-locale with fallback
  // Try headerConfigGuest_{locale} first, fall back to headerConfigGuest (default)
  const baseKey = isAuth ? 'headerConfigLogged' : 'headerConfigGuest'
  const localizedKey = `${baseKey}_${locale}`
  const configRow = (await db.siteSetting.findUnique({ where: { key: localizedKey } }))
    ?? (await db.siteSetting.findUnique({ where: { key: baseKey } }))
  const config = parseHeaderConfig(configRow?.value)

  // Default nav links (used when config is not set)
  const defaultLinks: NavLink[] = [
    { label: ssrT(locale, 'public.verifiedDoctors', 'Doctors'), link: `/${locale}/doctors` },
    { label: ssrT(locale, 'public.verifiedHospitals', 'Hospitals'), link: `/${locale}/hospitals` },
    { label: ssrT(locale, 'public.blogTitle', 'Blog'), link: `/${locale}/blog` },
  ]
  const navLinks = config?.menuItems?.length ? config.menuItems : defaultLinks
  const ctaText = config?.ctaLabel || (isAuth ? undefined : 'Login / Sign Up')
  const ctaHref = config?.ctaLink || `/${locale}/login`
  const logoText = 'Wishubest'

  return (
    <header className="sticky top-0 z-40 border-b border-divider bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 24 }} aria-hidden>
            monitor_heart
          </span>
          <span className="hidden sm:inline">{logoText}</span>
        </Link>

        {/* Nav links */}
        <nav className="flex flex-1 items-center justify-center gap-1 sm:gap-2">
          {navLinks.map((link, idx) => (
            <Link
              key={idx}
              href={link.link}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side: language + auth */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Language selector (CSS-only dropdown) */}
          <div className="group relative">
            <button
              className="flex items-center gap-1 rounded-full border border-divider px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              aria-label="Language"
            >
              <span>{LOCALE_META[locale as Locale]?.flag ?? '🌐'}</span>
              <span className="hidden sm:inline">{LOCALE_META[locale as Locale]?.native ?? locale}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>expand_more</span>
            </button>
            <div className="invisible absolute end-0 top-full z-50 mt-1 w-40 rounded-[14px] border border-divider bg-surface p-1 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
              {LOCALES.map((l) => (
                <Link
                  key={l}
                  href={`/${l}`}
                  className={locale === l
                    ? 'flex items-center gap-2 rounded-[10px] bg-accent px-3 py-2 text-sm font-medium text-foreground'
                    : 'flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                  }
                >
                  <span className="text-base">{LOCALE_META[l].flag}</span>
                  <span>{LOCALE_META[l].native}</span>
                </Link>
              ))}
            </div>
          </div>

          <PublicAuthArea
            initialIsAuth={isAuth}
            initialSession={session ? { name: session.name, email: session.email, role: session.role, avatarUrl: session.avatarUrl } : null}
            ctaText={ctaText}
            ctaHref={ctaHref}
          />
        </div>
      </div>
    </header>
  )
}
