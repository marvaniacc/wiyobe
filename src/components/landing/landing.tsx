'use client'
import Link from 'next/link'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Minimal role chooser for panel.wishubest.com
// Marketing content lives on wishubest.com (WordPress/Hugo)
// Each button navigates to the auth screen with the role pre-selected
const ROLES = [
  { role: 'PATIENT', icon: 'personal_injury', color: 'bg-primary/10 text-primary', labelKey: 'role.patient' },
  { role: 'DOCTOR', icon: 'medical_services', color: 'bg-success/10 text-success', labelKey: 'role.doctor' },
  { role: 'HOSPITAL', icon: 'local_hospital', color: 'bg-warning/10 text-warning', labelKey: 'role.hospital' },
  { role: 'HOTEL', icon: 'hotel', color: 'bg-primary/10 text-primary', labelKey: 'role.hotel' },
  { role: 'TRANSLATOR', icon: 'translate', color: 'bg-error/10 text-error', labelKey: 'role.translator' },
  { role: 'AFFILIATE', icon: 'campaign', color: 'bg-info/10 text-info', labelKey: 'role.affiliate' },
  { role: 'ADMIN', icon: 'admin_panel_settings', color: 'bg-muted text-muted-foreground', labelKey: 'role.admin' },
] as const

export function LandingPage() {
  const goAuth = useApp((s) => s.goAuth)
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const { t } = useT()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header — brand + language + theme only */}
      <header className="flex h-16 items-center justify-between border-b border-divider px-4 md:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <Icon name="monitor_heart" size={22} fill />
          </div>
          <span className="text-lg font-semibold text-foreground">{t('brand.name')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Blog link — public SSR route */}
          <Link
            href="/blog"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon name="article" size={18} />
            <span className="hidden sm:inline">Blog</span>
          </Link>
          {/* Language */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" title={t('common.language')}>
                <Icon name="translate" size={20} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {LOCALES.map((l) => (
                <DropdownMenuItem key={l} onClick={() => setLocale(l as Locale)} className={cn(locale === l && 'bg-accent')}>
                  <span className="text-base">{LOCALE_META[l].flag}</span>
                  <span>{LOCALE_META[l].native}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Theme */}
          <Button size="icon" variant="ghost" onClick={toggleTheme} title="Theme">
            <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size={20} />
          </Button>
        </div>
      </header>

      {/* Main — role chooser */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-foreground">{t('brand.name')}</h1>
            <p className="text-muted-foreground">{t('brand.tagline')}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map(({ role, icon, color, labelKey }) => (
              <div key={role} className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-start gap-3 h-auto py-4"
                  onClick={() => goAuth('signin', role)}
                >
                  <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', color)}>
                    <Icon name={icon} size={20} fill />
                  </div>
                  <span className="font-medium">{t(labelKey)}</span>
                </Button>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {t('auth.welcome')} ·{' '}
              <button
                onClick={() => goAuth('signup', 'PATIENT')}
                className="font-medium text-primary hover:underline"
              >
                {t('common.signup')}
              </button>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-divider bg-surface px-6 py-4 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4">
          <span>© {new Date().getFullYear()} {t('brand.name')}. {t('footer.rights')}</span>
          <span className="text-divider">·</span>
          <Link href="/blog" className="font-medium text-muted-foreground transition-colors hover:text-primary">
            Blog
          </Link>
        </div>
      </footer>
    </div>
  )
}
