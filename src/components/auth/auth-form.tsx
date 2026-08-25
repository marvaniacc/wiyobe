'use client'

import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Icon } from '@/components/shared/icon'
import { GoogleIcon } from '@/components/shared/google-icon'
import { OtpInput } from '@/components/auth/otp-input'
import { toast } from 'sonner'
import { translate, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
  }
}

type AuthType = 'login' | 'signup' | 'forgot'
type Role = 'patient' | 'doctor' | 'hospital' | 'hotel' | 'translator' | 'affiliate'

type AuthFormProps = {
  type?: AuthType
  role?: Role
  locale?: string
  display?: 'inline' | 'modal'
  buttonText?: string
  redirectPath?: string
}

const ROLE_OPTIONS: { value: Role; labelKey: string; icon: string }[] = [
  { value: 'patient', labelKey: 'role.patient', icon: 'personal_injury' },
  { value: 'doctor', labelKey: 'role.doctor', icon: 'medical_services' },
  { value: 'hospital', labelKey: 'role.hospital', icon: 'local_hospital' },
  { value: 'hotel', labelKey: 'role.hotel', icon: 'hotel' },
  { value: 'translator', labelKey: 'role.translator', icon: 'translate' },
  { value: 'affiliate', labelKey: 'role.affiliate', icon: 'campaign' },
]

/** Password field with show/hide toggle (Material Symbols, on-system). */
function PasswordInput({ id, value, onChange, placeholder, autoFocus }: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '••••••••'}
        className="h-11 pe-11"
        required
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>
          {show ? 'visibility_off' : 'visibility'}
        </span>
      </button>
    </div>
  )
}

/**
 * AuthForm — login / signup (email-OTP verified) / password recovery.
 *
 * Signup is a two-step flow: account details → 6-digit email code.
 * The account is only created after the code is verified
 * (POST /api/auth/otp/send purpose=signup → POST /api/auth/otp/verify).
 *
 * All labels are translated via translate(locale, key, fallback).
 */
export function AuthForm({
  type = 'signup',
  role = 'patient',
  locale = 'en',
  display = 'inline',
  buttonText,
  redirectPath,
}: AuthFormProps) {
  const router = useRouter()
  const isSignup = type === 'signup'
  const isForgot = type === 'forgot'
  const loc = locale as Locale

  // Session check
  const [existingSession, setExistingSession] = useState<{ name: string | null; role: string; email: string } | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<Role>(role)
  const [submitting, setSubmitting] = useState(false)

  // Signup OTP step
  const [step, setStep] = useState<'details' | 'code'>('details')
  const [otp, setOtp] = useState('')
  const [resendIn, setResendIn] = useState(0)

  // Forgot flow step
  const [forgotStep, setForgotStep] = useState<'email' | 'reset' | 'done'>('email')
  const [resetCode, setResetCode] = useState('')

  // Cloudflare Turnstile (signup step 1 — the server enforces it on otp/send)
  const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)
  const [cfToken, setCfToken] = useState('')

  const t = (key: string, fallback: string) => translate(loc, key, fallback)

  const renderTurnstile = useCallback(() => {
    if (!isSignup || !TURNSTILE_SITE_KEY || !window.turnstile || !turnstileRef.current || turnstileWidgetId.current) return
    turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setCfToken(token),
      'expired-callback': () => setCfToken(''),
      theme: 'auto',
    })
  }, [isSignup, TURNSTILE_SITE_KEY])

  const resetTurnstile = useCallback(() => {
    setCfToken('')
    if (turnstileWidgetId.current && window.turnstile) window.turnstile.reset(turnstileWidgetId.current)
  }, [])

  useEffect(() => {
    renderTurnstile()
  }, [renderTurnstile])

  // Google OAuth availability (server-provided client id)
  const [googleReady, setGoogleReady] = useState(false)
  useEffect(() => {
    if (isForgot) return
    fetch('/api/auth/google', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setGoogleReady(!!d?.hasGoogle && !!d?.clientId))
      .catch(() => {})
  }, [isForgot])

  function handleGoogleSignIn(mode: 'login' | 'signup') {
    const params = new URLSearchParams({ role: selectedRole.toUpperCase(), mode })
    if (redirectPath) params.set('redirect', redirectPath)
    window.location.href = `/api/auth/google/start?${params.toString()}`
  }

  // Resend cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setInterval(() => setResendIn((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [resendIn])

  // Surface OAuth errors/notices passed back via ?error= / ?notice=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthError = params.get('error')
    const notice = params.get('notice')
    if (oauthError || notice) {
      import('sonner').then(({ toast }) => (oauthError ? toast.error(oauthError) : toast.info(notice!)))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Session check on mount
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.session) setExistingSession(data.session)
      })
      .catch(() => {})
      .finally(() => setSessionChecked(true))
  }, [])

  // ── Submit handlers ─────────────────────────────────────────────────────

  async function handleSendSignupCode(e?: FormEvent) {
    e?.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          purpose: 'signup',
          cfToken: cfToken || undefined,
          signupData: {
            role: selectedRole.toUpperCase(),
            name: name.trim(),
            password: password,
            preferredLanguage: loc,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('auth.authFailed', 'Authentication failed'))
      setStep('code')
      setResendIn(45)
      setCfToken('') // token was consumed server-side; resends rely on the server's grace marker
      toast.success(t('auth.codeSent', 'Verification code sent — check your inbox'))
    } catch (err: any) {
      toast.error(err.message || t('auth.authFailed', 'Authentication failed'))
      resetTurnstile()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifySignupCode(e?: FormEvent) {
    e?.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: otp, purpose: 'signup' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('auth.authFailed', 'Authentication failed'))
      toast.success(t('auth.accountCreated', 'Account created!'))
      router.push(redirectPath || '/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || t('auth.authFailed', 'Authentication failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('auth.authFailed', 'Authentication failed'))
      toast.success(t('auth.welcomeBack', 'Welcome back!'))
      router.push(redirectPath || '/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || t('auth.authFailed', 'Authentication failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgot(e?: FormEvent) {
    e?.preventDefault()
    setSubmitting(true)
    try {
      if (forgotStep === 'email') {
        const res = await fetch('/api/auth/otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), purpose: 'reset' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('auth.authFailed', 'Authentication failed'))
        setForgotStep('reset')
        setResendIn(45)
        toast.success(t('auth.codeSent', 'Verification code sent — check your inbox'))
      } else if (forgotStep === 'reset') {
        const res = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), code: resetCode, purpose: 'reset', newPassword: password }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('auth.authFailed', 'Authentication failed'))
        setForgotStep('done')
        toast.success(t('auth.passwordReset', 'Password updated — sign in with your new password'))
      }
    } catch (err: any) {
      toast.error(err.message || t('auth.authFailed', 'Authentication failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (resendIn > 0) return
    setSubmitting(true)
    try {
      const purpose = isSignup ? 'signup' : 'reset'
      const body: Record<string, unknown> = { email: email.trim(), purpose }
      if (isSignup) {
        body.cfToken = cfToken || undefined
        body.signupData = {
          role: selectedRole.toUpperCase(),
          name: name.trim(),
          password: password,
          preferredLanguage: loc,
        }
      }
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('auth.authFailed', 'Authentication failed'))
      setResendIn(45)
      toast.success(t('auth.codeSent', 'Verification code sent — check your inbox'))
    } catch (err: any) {
      toast.error(err.message || t('auth.authFailed', 'Authentication failed'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Presentation ────────────────────────────────────────────────────────

  const heading =
    buttonText ||
    (isForgot
      ? forgotStep === 'done'
        ? t('auth.passwordResetDone', 'Password updated')
        : t('auth.resetPassword', 'Reset your password')
      : isSignup
        ? t('auth.createAccount', 'Create your account')
        : t('auth.welcomeBack', 'Welcome back'))
  const ctaLabel = isForgot
    ? forgotStep === 'email'
      ? t('auth.sendCodeBtn', 'Send code')
      : t('auth.resetBtn', 'Set new password')
    : isSignup
      ? t('auth.createBtn', 'Create Account')
      : t('auth.signInBtn', 'Sign In')

  const cardHeader = (icon: string, desc: string) => (
    <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent px-6 pb-4 pt-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>{icon}</span>
        </div>
        <div>
          <CardTitle className="text-lg">{heading}</CardTitle>
          <CardDescription className="mt-0.5 text-xs">{desc}</CardDescription>
        </div>
      </div>
    </CardHeader>
  )

  // Session check not completed — loading
  if (!sessionChecked) {
    return (
      <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-6')}>
        <div className="flex h-40 items-center justify-center rounded-[16px] border border-divider bg-surface">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-divider border-t-primary" />
        </div>
      </div>
    )
  }

  // Already logged in — show "already logged in" card
  if (existingSession) {
    return (
      <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-6')}>
        <Card className="overflow-hidden border-divider shadow-xl">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent px-6 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-success/10 text-success">
                <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden>check_circle</span>
              </div>
              <div>
                <CardTitle className="text-lg">{t('auth.alreadyLoggedIn', "You're already logged in")}</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  {t('auth.signedInAs', 'Signed in as')} <strong>{existingSession.name || existingSession.email}</strong> ({existingSession.role})
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="flex-1 gap-2" onClick={() => router.push('/dashboard')}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>dashboard</span>
                {t('auth.goToDashboard', 'Go to Dashboard')}
              </Button>
              <Button size="lg" variant="outline" className="flex-1 gap-2 text-error hover:bg-error/5" onClick={async () => {
                try { await fetch('/api/auth/signout', { method: 'POST' }) } catch {}
                window.location.href = '/en'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>logout</span>
                {t('auth.signOutBtn', 'Sign out')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── FORGOT PASSWORD ─────────────────────────────────────────────────────
  if (isForgot) {
    return (
      <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-6')}>
        <Card className="overflow-hidden border-divider shadow-xl">
          {forgotStep !== 'done' && cardHeader('lock_reset', t('auth.resetDesc', "We'll email you a 6-digit code to reset it."))}
          <CardContent className="p-6">
            {forgotStep === 'done' ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
                  <span className="material-symbols-outlined" style={{ fontSize: 30 }} aria-hidden>check_circle</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('auth.passwordResetDoneDesc', 'Your password has been updated. Sign in with your new password.')}
                </p>
                <Button className="h-11 w-full gap-2" onClick={() => router.push(`/${loc}/login`)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>login</span>
                  {t('auth.signInBtn', 'Sign In')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">{t('auth.emailLabel', 'Email')}</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11" required disabled={forgotStep === 'reset'} />
                </div>

                {forgotStep === 'reset' && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">{t('auth.codeLabel', '6-digit code')}</Label>
                      <OtpInput length={6} value={resetCode} onChange={setResetCode} onComplete={setResetCode} />
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendIn > 0 || submitting}
                        className="text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                      >
                        {resendIn > 0 ? t('auth.resendIn', 'Resend code in {s}s').replace('{s}', String(resendIn)) : t('auth.resendCode', 'Resend code')}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-sm font-medium">{t('auth.newPasswordLabel', 'New password')}</Label>
                      <PasswordInput id="new-password" value={password} onChange={setPassword} />
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  disabled={submitting || !email.trim() || (forgotStep === 'reset' && (resetCode.length !== 6 || !password))}
                  className="h-11 w-full gap-2"
                >
                  {submitting && <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
                  {ctaLabel}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        {forgotStep !== 'done' && (
          <Button variant="outline" className="mt-3 h-11 w-full gap-2" onClick={() => router.push(`/${loc}/login`)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>arrow_back</span>
            {t('auth.backToSignIn', 'Back to sign in')}
          </Button>
        )}
      </div>
    )
  }

  // ── LOGIN ───────────────────────────────────────────────────────────────
  if (!isSignup) {
    return (
      <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-6')}>
        <Card className="overflow-hidden border-divider shadow-xl">
          {cardHeader('login', t('auth.signInDesc', 'Sign in to access your dashboard.'))}
          <CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">{t('auth.emailLabel', 'Email')}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">{t('auth.passwordLabel', 'Password')}</Label>
                  <button
                    type="button"
                    onClick={() => router.push(`/${loc}/forgot-password`)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t('auth.forgotPassword', 'Forgot password?')}
                  </button>
                </div>
                <PasswordInput id="password" value={password} onChange={setPassword} />
              </div>

              <Button type="submit" disabled={submitting || !email.trim() || !password.trim()} className="h-11 w-full gap-2">
                {submitting ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>login</span>
                )}
                {submitting ? t('auth.pleaseWait', 'Please wait…') : ctaLabel}
              </Button>

              {googleReady && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-divider" />
                    <span className="text-xs text-muted-foreground">{t('auth.orContinueWith', 'or continue with')}</span>
                    <div className="h-px flex-1 bg-divider" />
                  </div>
                  <Button type="button" variant="outline" className="h-11 w-full gap-2" onClick={() => handleGoogleSignIn('login')}>
                    <GoogleIcon size={18} />
                    {t('auth.googleSignIn', 'Continue with Google')}
                  </Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>
        <Button variant="outline" className="mt-3 h-11 w-full gap-2" onClick={() => router.push(`/${loc}/signup`)}>
          {t('auth.noAccount', "Don't have an account?")}&nbsp;
          <span className="font-semibold text-primary">{t('auth.signup', 'Sign up')}</span>
        </Button>
      </div>
    )
  }

  // ── SIGNUP (two-step, email OTP verification) ───────────────────────────
  return (
    <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-6')}>
      <Card className="overflow-hidden border-divider shadow-xl">
        {step === 'details' ? (
          cardHeader('person_add', t('auth.createDesc', 'Create your Wishubest account in seconds.'))
        ) : (
          cardHeader('mark_email_read', t('auth.codeSentTo', "We sent a 6-digit code to") + ' ' + email))
        }
        <CardContent className="p-6">
          {step === 'details' ? (
            <form onSubmit={handleSendSignupCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium">{t('auth.fullName', 'Full Name')}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className="h-11" required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">{t('auth.emailLabel', 'Email')}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11" required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">{t('auth.passwordLabel', 'Password')}</Label>
                <PasswordInput id="password" value={password} onChange={setPassword} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t('auth.rolePrompt', 'I want to sign up as a…')}</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>{r.icon}</span>
                          {t(r.labelKey, r.value)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {googleReady && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-divider" />
                    <span className="text-xs text-muted-foreground">{t('auth.orContinueWith', 'or continue with')}</span>
                    <div className="h-px flex-1 bg-divider" />
                  </div>
                  <Button type="button" variant="outline" className="h-11 w-full gap-2" onClick={() => handleGoogleSignIn('signup')}>
                    <GoogleIcon size={18} />
                    {t('auth.googleSignUp', 'Sign up with Google')}
                  </Button>
                </>
              )}

              {TURNSTILE_SITE_KEY && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t('auth.securityCheck', 'Security check')}</Label>
                  <div className="overflow-hidden rounded-[10px]">
                    <div ref={turnstileRef} />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting || !email.trim() || !password.trim() || !name.trim() || (!!TURNSTILE_SITE_KEY && !cfToken)}
                className="h-11 w-full gap-2"
              >
                {submitting && <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
                {t('auth.sendCodeBtn', 'Send verification code')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifySignupCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t('auth.codeLabel', '6-digit code')}</Label>
                <OtpInput length={6} value={otp} onChange={setOtp} onComplete={setOtp} />
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendIn > 0 || submitting}
                  className="text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  {resendIn > 0 ? t('auth.resendIn', 'Resend code in {s}s').replace('{s}', String(resendIn)) : t('auth.resendCode', 'Resend code')}
                </button>
              </div>

              <Button type="submit" disabled={submitting || otp.length !== 6} className="h-11 w-full gap-2">
                {submitting && <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />}
                {t('auth.verifyBtn', 'Verify & create account')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      {step === 'details' && (
        <Button variant="outline" className="mt-3 h-11 w-full gap-2" onClick={() => router.push(`/${loc}/login`)}>
          {t('auth.haveAccount', 'Already have an account?')}&nbsp;
          <span className="font-semibold text-primary">{t('auth.signin', 'Sign in')}</span>
        </Button>
      )}
      {isSignup && TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="lazyOnload"
          onReady={renderTurnstile}
        />
      )}
    </div>
  )
}
