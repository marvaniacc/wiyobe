'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/hooks/use-t'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiPost } from '@/hooks/use-api'
import { COUNTRIES } from '@/lib/countries'
import { DOCTOR_SPECIALTIES } from '@/lib/specialties'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { AuthModal } from '@/components/landing/auth-modal'

export interface RoleLandingConfig {
  role: 'PATIENT' | 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR' | 'AFFILIATE'
  heroTitle: string
  heroSubtitle: string
  heroImage: string
  features: { icon: string; title: string; desc: string }[]
  statCards: { value: string; label: string; icon: string }[]
  accentColor: string
  ctaText: string
}

export function RoleLandingPage({ config }: { config: RoleLandingConfig }) {
  const setSession = useApp((s) => s.setSession)
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const { t, dir } = useT()
  const [authOpen, setAuthOpen] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')

  // Check if already logged in → redirect to /
  useEffect(() => {
    fetch('/api/auth/signup', { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (d.session) {
        setSession(d.session)
        window.location.href = '/'
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openAuth(m: 'signin' | 'signup') {
    setMode(m)
    setAuthOpen(true)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" dir={dir}>
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-divider bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
              <Icon name="monitor_heart" size={22} fill />
            </div>
            <span className="text-lg font-semibold">MedTravel</span>
          </a>
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
            <Button size="sm" variant="ghost" onClick={() => openAuth('signin')}>{t('common.signin')}</Button>
            <Button size="sm" onClick={() => openAuth('signup')}>{config.ctaText}</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-divider">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 py-12 md:px-8 md:py-20 lg:grid-cols-2">
          <div className="animate-fade-in">
            <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
              {config.heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">{config.heroSubtitle}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => openAuth('signup')} className="w-full sm:w-auto">
                <Icon name="person_add" size={20} /> {config.ctaText}
              </Button>
              <Button size="lg" variant="outline" onClick={() => openAuth('signin')} className="w-full sm:w-auto">
                {t('common.signin')}
              </Button>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-4">
              {config.statCards.map((s, i) => (
                <div key={i} className="rounded-[14px] border border-divider bg-surface p-4 text-center">
                  <div className={cn('mx-auto mb-2 flex size-8 items-center justify-center rounded-[8px]', config.accentColor)}>
                    <Icon name={s.icon} size={18} fill />
                  </div>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="overflow-hidden rounded-[24px] border border-divider shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={config.heroImage} alt={config.heroTitle} className="aspect-[4/3] w-full object-cover" loading="eager" />
            </div>
            <div className="absolute -bottom-4 -start-4 rounded-[16px] border border-divider bg-surface p-4 shadow-md">
              <div className="flex items-center gap-2">
                <div className={cn('flex size-10 items-center justify-center rounded-[10px]', config.accentColor)}>
                  <Icon name="verified" size={20} fill />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Verified Platform</p>
                  <p className="text-xs text-muted-foreground">Trusted by thousands</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-divider bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {config.features.map((f, i) => (
              <div key={i} className="rounded-[16px] border border-divider bg-surface-secondary/50 p-6">
                <div className={cn('mb-4 flex size-11 items-center justify-center rounded-[12px]', config.accentColor)}>
                  <Icon name={f.icon} size={24} fill />
                </div>
                <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Other roles */}
      <section className="border-b border-divider">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
          <p className="mb-6 text-center text-sm font-medium uppercase tracking-wide text-muted-foreground">Are you a different role?</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { href: '/patients', label: 'Patient', icon: 'personal_injury' },
              { href: '/doctors', label: 'Doctor', icon: 'medical_services' },
              { href: '/hospitals', label: 'Hospital', icon: 'local_hospital' },
              { href: '/hotels', label: 'Hotel / Suite', icon: 'hotel' },
              { href: '/translators', label: 'Translator', icon: 'translate' },
              { href: '/affiliates', label: 'Affiliate', icon: 'campaign' },
            ].map(r => (
              <a key={r.href} href={r.href} className="flex items-center gap-2 rounded-full border border-divider bg-surface px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground">
                <Icon name={r.icon} size={16} />
                {r.label}
              </a>
            ))}
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
              <span className="font-semibold">MedTravel</span>
            </div>
            <div className="flex gap-5 text-sm text-muted-foreground">
              <a href="/" className="hover:text-foreground">Home</a>
            </div>
          </div>
          <div className="mt-6 border-t border-divider pt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} MedTravel. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Auth Popup Modal */}
      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        mode={mode}
        setMode={setMode}
        role={config.role}
        onSuccess={(user) => {
          setSession(user)
          window.location.href = '/'
        }}
      />
    </div>
  )
}
