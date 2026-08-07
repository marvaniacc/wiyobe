'use client'
import { useState } from 'react'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AuthModal } from '@/components/landing/role-landing-page'

const ROLE_PAGES = [
  { href: '/patients', icon: 'personal_injury', color: 'bg-blue-50 text-primary', label: 'Patient', desc: 'Find and book trusted medical care abroad' },
  { href: '/doctors', icon: 'medical_services', color: 'bg-green-50 text-success', label: 'Doctor', desc: 'Reach international patients and grow your practice' },
  { href: '/hospitals', icon: 'local_hospital', color: 'bg-amber-50 text-warning', label: 'Hospital', desc: 'Showcase your facility to a global audience' },
  { href: '/hotels', icon: 'hotel', color: 'bg-purple-50 text-[#9334E6]', label: 'Hotel / Suite', desc: 'Host recovering patients and medical travelers' },
  { href: '/translators', icon: 'translate', color: 'bg-red-50 text-error', label: 'Translator', desc: 'Bridge the language gap for medical travelers' },
  { href: '/affiliates', icon: 'campaign', color: 'bg-teal-50 text-[#007B83]', label: 'Affiliate', desc: 'Earn commissions by referring patients' },
]

const FEATURES = [
  { icon: 'compare', title: 'Compare prices & reviews', desc: 'See doctors, hospitals, hotels and translators side by side before you decide.' },
  { icon: 'lock', title: 'Secure platform payments', desc: 'Every payment goes through us. Your money is protected until your service is complete.' },
  { icon: 'verified_user', title: 'Verified providers', desc: 'Every doctor, hospital, hotel and translator is reviewed by our team.' },
  { icon: 'language', title: 'Speak your language', desc: 'Full support in English, Turkish, Persian and Arabic — including right-to-left layouts.' },
]

export function LandingPage() {
  const goLanding = useApp((s) => s.goLanding)
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const setSession = useApp((s) => s.setSession)
  const goDashboard = useApp((s) => s.goDashboard)
  const { t, dir } = useT()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')

  function openAuth(m: 'signin' | 'signup') {
    setAuthMode(m)
    setAuthOpen(true)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" dir={dir}>
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-divider bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <button onClick={goLanding} className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
              <Icon name="monitor_heart" size={22} fill />
            </div>
            <span className="text-lg font-semibold">{t('brand.name')}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost"><Icon name="translate" size={20} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {LOCALES.map((l) => (
                  <DropdownMenuItem key={l} onClick={() => setLocale(l as Locale)} className={cn(locale === l && 'bg-accent')}>
                    <span className="text-base">{LOCALE_META[l].flag}</span> {LOCALE_META[l].native}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon" variant="ghost" onClick={toggleTheme}><Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size={20} /></Button>
            <Button size="sm" variant="ghost" onClick={() => openAuth('signin')}>{t('common.signin')}</Button>
            <Button size="sm" onClick={() => openAuth('signup')}>{t('common.signup')}</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-divider">
        <div className="absolute inset-0 -z-10 bg-surface" />
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-divider bg-surface-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
              <Icon name="verified" size={14} className="text-success" />
              {t('landing.feature.verified.title')}
            </div>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              {t('landing.hero.title')}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => openAuth('signup')} className="w-full sm:w-auto">
                <Icon name="search" size={20} /> {t('landing.hero.cta')}
              </Button>
              <Button size="lg" variant="outline" onClick={() => openAuth('signin')} className="w-full sm:w-auto">
                {t('common.signin')}
              </Button>
            </div>
          </div>

          {/* Role pages */}
          <div className="mx-auto mt-16 max-w-5xl">
            <p className="mb-6 text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">Choose your role to get started</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {ROLE_PAGES.map((r) => (
                <a
                  key={r.href}
                  href={r.href}
                  className="group flex flex-col items-center gap-3 rounded-[16px] border border-divider bg-surface p-5 text-center shadow-[0_1px_2px_rgba(60,64,67,0.06)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_4px_12px_rgba(26,115,232,0.12)]"
                >
                  <div className={cn('flex size-12 items-center justify-center rounded-[14px] transition-transform group-hover:scale-105', r.color)}>
                    <Icon name={r.icon} size={26} fill />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{r.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{r.desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-divider bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.icon} className="rounded-[16px] border border-divider bg-surface-secondary/50 p-6">
                <div className="mb-4 flex size-11 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
                  <Icon name={f.icon} size={24} fill />
                </div>
                <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-divider">
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
          <div className="flex flex-col items-center justify-between gap-6 rounded-[24px] border border-divider bg-accent/40 p-8 md:flex-row md:p-10">
            <div className="max-w-xl text-center md:text-start">
              <h2 className="text-2xl font-semibold text-foreground">{t('landing.hero.title')}</h2>
              <p className="mt-2 text-muted-foreground">{t('landing.hero.subtitle')}</p>
            </div>
            <Button size="lg" onClick={() => openAuth('signup')} className="shrink-0">
              {t('common.signup')} <Icon name="arrow_forward" size={18} className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
                <Icon name="monitor_heart" size={18} fill />
              </div>
              <span className="font-semibold">{t('brand.name')}</span>
              <span className="text-sm text-muted-foreground">· {t('brand.tagline')}</span>
            </div>
            <div className="flex gap-5 text-sm text-muted-foreground">
              <a href="/patients" className="hover:text-foreground">Patients</a>
              <a href="/doctors" className="hover:text-foreground">Doctors</a>
              <a href="/hospitals" className="hover:text-foreground">Hospitals</a>
              <a href="/hotels" className="hover:text-foreground">Hotels</a>
              <a href="/affiliates" className="hover:text-foreground">Affiliates</a>
            </div>
          </div>
          <div className="mt-6 border-t border-divider pt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} {t('brand.name')}. {t('footer.rights')}
          </div>
        </div>
      </footer>

      {/* Auth Popup Modal — patient signup/login from home page */}
      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        mode={authMode}
        setMode={setAuthMode}
        role="PATIENT"
        onSuccess={(user) => {
          setSession(user)
          goDashboard('overview')
        }}
      />
    </div>
  )
}
