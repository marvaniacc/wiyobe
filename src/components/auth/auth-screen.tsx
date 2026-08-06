'use client'
import { useState } from 'react'
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const ROLES = [
  { role: 'PATIENT', icon: 'personal_injury', labelKey: 'role.patient' },
  { role: 'DOCTOR', icon: 'medical_services', labelKey: 'role.doctor' },
  { role: 'HOSPITAL', icon: 'local_hospital', labelKey: 'role.hospital' },
  { role: 'HOTEL', icon: 'hotel', labelKey: 'role.hotel' },
  { role: 'TRANSLATOR', icon: 'translate', labelKey: 'role.translator' },
]

export function AuthScreen() {
  const view = useApp((s) => s.view)
  const goLanding = useApp((s) => s.goLanding)
  const goAuth = useApp((s) => s.goAuth)
  const setSession = useApp((s) => s.setSession)
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const { t, dir } = useT()

  const mode = view.name === 'auth' ? view.mode : 'signin'
  const role = view.name === 'auth' ? view.role : 'PATIENT'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [languages, setLanguages] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signin') {
        const res = await apiPost('/api/auth/signin', { email, password })
        setSession(res.user)
        toast.success(t('auth.welcomeBack'))
      } else {
        const body: any = { email, password, role, name, preferredLanguage: locale, country, city }
        if (role === 'DOCTOR' || role === 'TRANSLATOR') body.languages = languages || locale
        if (role === 'DOCTOR') body.specialty = specialty
        const res = await apiPost('/api/auth/signup', body)
        if (res.needsApproval) {
          toast.success(t('auth.accountPending'))
          goAuth('signin', role)
        } else {
          setSession(res.user)
          toast.success(t('auth.welcome'))
        }
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" dir={dir}>
      {/* Top bar */}
      <header className="flex h-16 items-center justify-between border-b border-divider bg-surface px-4 md:px-8">
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
          <Button variant="ghost" size="sm" onClick={() => goAuth(mode === 'signin' ? 'signup' : 'signin', role)}>
            {mode === 'signin' ? t('common.signup') : t('common.signin')}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Role tabs */}
          <div className="mb-6 flex flex-wrap items-center justify-center gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => goAuth(mode, r.role)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  role === r.role ? 'bg-primary text-primary-foreground' : 'bg-surface-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon name={r.icon} size={15} fill={role === r.role} />
                {t(r.labelKey)}
              </button>
            ))}
          </div>

          <div className="rounded-[24px] border border-divider bg-surface p-7 shadow-[0_1px_3px_rgba(60,64,67,0.08)] md:p-8">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold text-foreground">
                {mode === 'signin' ? t('auth.welcomeBack') : t('auth.createAccount')}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === 'signin' ? t('auth.signInToContinue') : `${t('auth.joinAs')} ${t(ROLES.find((r) => r.role === role)?.labelKey || '')}`}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t('common.name')}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('common.password')}</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
              </div>

              {mode === 'signup' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="country">{t('common.country')}</Label>
                    <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Turkey" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">{t('common.city')}</Label>
                    <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Istanbul" />
                  </div>
                </div>
              )}

              {mode === 'signup' && role === 'DOCTOR' && (
                <div className="space-y-1.5">
                  <Label htmlFor="specialty">{t('common.specialty')}</Label>
                  <Input id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Cardiology" />
                </div>
              )}

              {mode === 'signup' && (role === 'DOCTOR' || role === 'TRANSLATOR' || role === 'HOSPITAL' || role === 'HOTEL') && (
                <div className="space-y-1.5">
                  <Label htmlFor="languages">{t('common.languages')}</Label>
                  <Input id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, tr, fa, ar" />
                </div>
              )}

              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {loading ? <span className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : (mode === 'signin' ? t('common.signin') : t('common.signup'))}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-muted-foreground">
              {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
              <button onClick={() => goAuth(mode === 'signin' ? 'signup' : 'signin', role)} className="font-medium text-primary hover:underline">
                {mode === 'signin' ? t('common.signup') : t('common.signin')}
              </button>
            </div>

            {mode === 'signin' && (
              <div className="mt-5 rounded-[14px] border border-divider bg-surface-secondary/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Demo accounts</p>
                <p className="mt-1">admin@medtravel.com / admin123</p>
                <p>patient@medtravel.com / patient123</p>
                <p>doctor@medtravel.com / doctor123</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
