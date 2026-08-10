'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { GoogleIcon } from '@/components/shared/google-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/hooks/use-t'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiPost } from '@/hooks/use-api'
import { useApi } from '@/hooks/use-api'
import { OtpInput } from '@/components/auth/otp-input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

const ROLES = [
  { role: 'PATIENT', icon: 'personal_injury', labelKey: 'role.patient' },
  { role: 'DOCTOR', icon: 'medical_services', labelKey: 'role.doctor' },
  { role: 'HOSPITAL', icon: 'local_hospital', labelKey: 'role.hospital' },
  { role: 'HOTEL', icon: 'hotel', labelKey: 'role.hotel' },
  { role: 'TRANSLATOR', icon: 'translate', labelKey: 'role.translator' },
  { role: 'AFFILIATE', icon: 'campaign', labelKey: 'role.affiliate' },
]

type Step = 'credentials' | 'otp'
type SigninMethod = 'password' | 'otp'

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
  const roleLocked = view.name === 'auth' ? view.roleLocked : false

  // form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [languages, setLanguages] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')

  // flow state
  const [step, setStep] = useState<Step>('credentials')
  const [signinMethod, setSigninMethod] = useState<SigninMethod>('password')
  const [otp, setOtp] = useState('')
  const [otpPurpose, setOtpPurpose] = useState<'signup' | 'signin' | 'reset'>('signup')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // google demo dialog
  const [googleDialogOpen, setGoogleDialogOpen] = useState(false)
  const [googleEmail, setGoogleEmail] = useState('')
  const [googleName, setGoogleName] = useState('')

  // reset password
  const [newPassword, setNewPassword] = useState('')

  const { data: googleConfig } = useApi<{ hasGoogle: boolean; clientId: string | null; demoMode: boolean }>('/api/auth/google')

  // Reset state when mode/role changes
  useEffect(() => {
    setStep('credentials')
    setOtp('')
    setDevCode(null)
    setSigninMethod('password')
    setNewPassword('')
  }, [mode, role])

  // resend cooldown timer
  useEffect(() => {
    if (resendTimer <= 0) return
    const id = setInterval(() => setResendTimer((t) => t - 1), 1000)
    return () => clearInterval(id)
  }, [resendTimer])

  // Google Identity Services script (only if real credentials)
  const googleScriptLoaded = useRef(false)
  useEffect(() => {
    if (!googleConfig?.hasGoogle || googleScriptLoaded.current) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => { googleScriptLoaded.current = true }
    document.head.appendChild(script)
    return () => { script.remove() }
  }, [googleConfig?.hasGoogle])

  const canSubmitSignup = email && password.length >= 6 && name.length >= 2
  const canSubmitSignin = email && password.length >= 1
  const canSubmitOtpSignin = email.length > 0

  // ---- Handlers ----

  async function handlePasswordSignin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await apiPost('/api/auth/signin', { email, password })
      setSession(res.user)
      toast.success(t('auth.welcomeBack'))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp(purpose: 'signup' | 'signin' | 'reset') {
    if (purpose === 'signup' && !canSubmitSignup) {
      toast.error(t('auth.invalidCreds'))
      return
    }
    if (purpose === 'signin' && !canSubmitOtpSignin) {
      toast.error(t('auth.invalidCreds'))
      return
    }
    setLoading(true)
    setOtpPurpose(purpose)
    try {
      const payload: any = { email, purpose }
      if (purpose === 'signup') {
        const refCode = typeof window !== 'undefined' ? localStorage.getItem('mt_ref_code') : null
        payload.signupData = {
          role, name, password, preferredLanguage: locale, country, city,
          ...(role === 'DOCTOR' || role === 'TRANSLATOR' ? { languages: languages || locale } : {}),
          ...(role === 'DOCTOR' ? { specialty } : {}),
          ...(refCode ? { referralCode: refCode } : {}),
        }
      }
      const res = await apiPost('/api/auth/otp/send', payload)
      setDevCode(res.devCode || null)
      setStep('otp')
      setResendTimer(45)
      toast.success(t('auth.otpSent'))
      if (res.devCode) {
        toast.info(`Dev code: ${res.devCode}`, { duration: 8000 })
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(otpValue?: string) {
    const code = otpValue ?? otp
    if (code.length !== 6) {
      toast.error(t('auth.otpInvalid'))
      return
    }
    setLoading(true)
    try {
      const payload: any = { email, code, purpose: otpPurpose }
      if (otpPurpose === 'reset' && newPassword) {
        payload.newPassword = newPassword
      }
      const res = await apiPost('/api/auth/otp/verify', payload)
      if (otpPurpose === 'reset') {
        toast.success(t('auth.passwordReset'))
        setStep('credentials')
        setOtp('')
        setNewPassword('')
        setOtpPurpose('signup')
        goAuth('signin', role)
      } else if (res.needsApproval) {
        toast.success(t('auth.accountPending'))
        goAuth('signin', role)
        setStep('credentials')
        setOtp('')
      } else {
        setSession(res.user)
        toast.success(otpPurpose === 'signup' ? t('auth.welcome') : t('auth.welcomeBack'))
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleResendOtp() {
    if (resendTimer > 0) return
    await handleSendOtp(otpPurpose)
  }

  // ---- Google sign-in ----

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setLoading(true)
    try {
      const res = await apiPost('/api/auth/google/verify', { idToken: credential, role })
      if (res.needsApproval) {
        toast.success(t('auth.accountPending'))
        goAuth('signin', role)
      } else {
        setSession(res.user)
        toast.success(t('auth.welcome'))
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [role, setSession, goAuth, t])

  function handleGoogleClick() {
    if (googleConfig?.hasGoogle && googleScriptLoaded.current && window.google) {
      // Real Google OAuth using GIS popup
      window.google.accounts.id.initialize({
        client_id: googleConfig.clientId!,
        callback: (response: any) => handleGoogleCredential(response.credential),
      })
      window.google.accounts.id.prompt()
    } else {
      // Demo mode — open dialog
      setGoogleDialogOpen(true)
    }
  }

  async function handleGoogleDemo(e: React.FormEvent) {
    e.preventDefault()
    if (!googleEmail) return
    setLoading(true)
    try {
      const res = await apiPost('/api/auth/google/verify', {
        demoEmail: googleEmail,
        demoName: googleName || undefined,
        role,
      })
      setGoogleDialogOpen(false)
      setGoogleEmail('')
      setGoogleName('')
      if (res.needsApproval) {
        toast.success(t('auth.accountPending'))
        goAuth('signin', role)
      } else {
        setSession(res.user)
        toast.success(t('auth.welcome'))
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ---- Render ----

  const isSignup = mode === 'signup'
  const isOtpStep = step === 'otp'

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
          {/* Role tabs — hidden when roleLocked (e.g. ?auth=signup&role=doctor) */}
          {!roleLocked && (
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
          )}

          <div className="rounded-[24px] border border-divider bg-surface p-7 shadow-[0_1px_3px_rgba(60,64,67,0.08)] md:p-8">
            {isOtpStep ? (
              /* ========== OTP STEP ========== */
              <OtpStepView
                email={email}
                otp={otp}
                setOtp={setOtp}
                otpPurpose={otpPurpose}
                loading={loading}
                resendTimer={resendTimer}
                devCode={devCode}
                newPassword={newPassword}
                setNewPassword={setNewPassword}
                onVerify={handleVerifyOtp}
                onResend={handleResendOtp}
                onBack={() => { setStep('credentials'); setOtp('') }}
                t={t}
              />
            ) : (
              /* ========== CREDENTIALS STEP ========== */
              <>
                <div className="mb-6 text-center">
                  <h1 className="text-2xl font-semibold text-foreground">
                    {isSignup ? t('auth.createAccount') : t('auth.welcomeBack')}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {isSignup ? `${t('auth.joinAs')} ${t(ROLES.find((r) => r.role === role)?.labelKey || '')}` : t('auth.signInToContinue')}
                  </p>
                </div>

                {/* Google sign-in button */}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleGoogleClick}
                  disabled={loading}
                  className="w-full gap-3"
                >
                  <GoogleIcon size={20} />
                  {isSignup ? t('auth.continueWithGoogle') : t('auth.googleSignIn')}
                </Button>

                {/* Divider */}
                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-divider" />
                  <span className="text-xs font-medium text-muted-foreground">{t('auth.orContinueWith')}</span>
                  <div className="h-px flex-1 bg-divider" />
                </div>

                {/* Credentials form */}
                <form
                  onSubmit={isSignup
                    ? (e) => { e.preventDefault(); handleSendOtp('signup') }
                    : signinMethod === 'password'
                      ? handlePasswordSignin
                      : (e) => { e.preventDefault(); handleSendOtp('signin') }
                  }
                  className="space-y-4"
                >
                  {isSignup && (
                    <div className="space-y-1.5">
                      <Label htmlFor="name">{t('common.name')}</Label>
                      <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t('common.email')}</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                  </div>

                  {(!isSignup && signinMethod === 'password') && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">{t('common.password')}</Label>
                        <button
                          type="button"
                          onClick={() => { setOtpPurpose('reset'); setStep('otp'); setResendTimer(0) }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {t('auth.forgotPassword')}
                        </button>
                      </div>
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={1} placeholder="••••••••" />
                    </div>
                  )}

                  {isSignup && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="password">{t('common.password')}</Label>
                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
                      </div>
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
                      {role === 'DOCTOR' && (
                        <div className="space-y-1.5">
                          <Label htmlFor="specialty">{t('common.specialty')}</Label>
                          <Input id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Cardiology" />
                        </div>
                      )}
                      {(role === 'DOCTOR' || role === 'TRANSLATOR' || role === 'HOSPITAL' || role === 'HOTEL') && (
                        <div className="space-y-1.5">
                          <Label htmlFor="languages">{t('common.languages')}</Label>
                          <Input id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, tr, fa, ar" />
                        </div>
                      )}
                    </>
                  )}

                  {/* Submit button */}
                  <Button type="submit" size="lg" disabled={loading} className="w-full">
                    {loading ? <span className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : (
                      isSignup
                        ? <span className="flex items-center gap-2"><Icon name="mail" size={18} />{t('auth.otpSendSignup')}</span>
                        : signinMethod === 'password'
                          ? t('common.signin')
                          : <span className="flex items-center gap-2"><Icon name="mark_email_read" size={18} />{t('auth.otpSendSignin')}</span>
                    )}
                  </Button>
                </form>

                {/* Signin method toggle */}
                {!isSignup && (
                  <button
                    onClick={() => setSigninMethod((m) => m === 'password' ? 'otp' : 'password')}
                    className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {signinMethod === 'password' ? (
                      <><Icon name="sms" size={14} />{t('auth.useOtpInstead')}</>
                    ) : (
                      <><Icon name="lock" size={14} />{t('auth.usePasswordInstead')}</>
                    )}
                  </button>
                )}

                {/* Switch signin/signup */}
                <div className="mt-5 text-center text-sm text-muted-foreground">
                  {isSignup ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
                  <button onClick={() => goAuth(isSignup ? 'signin' : 'signup', role)} className="font-medium text-primary hover:underline">
                    {isSignup ? t('common.signin') : t('common.signup')}
                  </button>
                </div>

                {/* Demo accounts hint */}
                {mode === 'signin' && (
                  <div className="mt-5 rounded-[14px] border border-divider bg-surface-secondary/50 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Demo accounts</p>
                    <p className="mt-1">admin@medtravel.com / admin123</p>
                    <p>patient@medtravel.com / patient123</p>
                    <p>doctor@medtravel.com / doctor123</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Google demo dialog */}
      <Dialog open={googleDialogOpen} onOpenChange={setGoogleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-[14px] bg-surface-secondary">
              <GoogleIcon size={28} />
            </div>
            <DialogTitle>{t('auth.googleDemoTitle')}</DialogTitle>
            <DialogDescription>{t('auth.googleDemoDesc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGoogleDemo} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-email">{t('common.email')}</Label>
              <Input id="g-email" type="email" value={googleEmail} onChange={(e) => setGoogleEmail(e.target.value)} required placeholder="your.google@gmail.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-name">{t('common.name')} ({t('common.optional')})</Label>
              <Input id="g-name" value={googleName} onChange={(e) => setGoogleName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setGoogleDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={loading || !googleEmail}>
                {loading ? <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : t('auth.simulateGoogle')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ===================== OTP Step View ===================== */

function OtpStepView({
  email, otp, setOtp, otpPurpose, loading, resendTimer, devCode,
  newPassword, setNewPassword, onVerify, onResend, onBack, t,
}: {
  email: string
  otp: string
  setOtp: (v: string) => void
  otpPurpose: 'signup' | 'signin' | 'reset'
  loading: boolean
  resendTimer: number
  devCode: string | null
  newPassword: string
  setNewPassword: (v: string) => void
  onVerify: (code?: string) => void
  onResend: () => void
  onBack: () => void
  t: (key: string, fallback?: string) => string
}) {
  return (
    <div className="animate-fade-in">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Icon name="mark_email_read" size={28} className="text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{t('auth.otpTitle')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t('auth.otpSubtitle')}{' '}
          <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      {otpPurpose === 'reset' && (
        <div className="mb-4 space-y-1.5">
          <Label htmlFor="newpw">{t('auth.newPassword')}</Label>
          <Input id="newpw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-center text-sm text-muted-foreground">{t('auth.otpEnterCode')}</Label>
          <OtpInput
            value={otp}
            onChange={setOtp}
            onComplete={(code) => onVerify(code)}
            disabled={loading}
          />
        </div>

        {devCode && (
          <div className="rounded-[14px] border border-warning/30 bg-warning/10 p-3 text-center">
            <p className="text-xs font-medium text-warning">
              <Icon name="info" size={14} className="me-1 inline" />
              Dev code: <span className="font-mono text-base font-bold tracking-widest">{devCode}</span>
            </p>
          </div>
        )}

        <Button size="lg" onClick={() => onVerify()} disabled={loading || otp.length !== 6} className="w-full">
          {loading ? <span className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : t('auth.otpVerify')}
        </Button>

        <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          {resendTimer > 0 ? (
            <span>{t('auth.otpResendIn')} {resendTimer}s</span>
          ) : (
            <button onClick={onResend} disabled={loading} className="font-medium text-primary hover:underline disabled:opacity-50">
              {t('auth.otpResend')}
            </button>
          )}
        </div>

        <button onClick={onBack} className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          <Icon name="arrow_back" size={14} className="rtl:rotate-180" />
          {t('common.back')}
        </button>
      </div>
    </div>
  )
}
