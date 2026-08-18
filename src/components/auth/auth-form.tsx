'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Icon } from '@/components/shared/icon'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type AuthType = 'login' | 'signup'
type Role = 'patient' | 'doctor' | 'hospital' | 'hotel' | 'translator' | 'affiliate'

type AuthFormProps = {
  type?: AuthType
  role?: Role
  display?: 'inline' | 'modal'
  buttonText?: string
}

const ROLE_OPTIONS: { value: Role; label: string; icon: string }[] = [
  { value: 'patient', label: 'Patient', icon: 'personal_injury' },
  { value: 'doctor', label: 'Doctor', icon: 'medical_services' },
  { value: 'hospital', label: 'Hospital', icon: 'local_hospital' },
  { value: 'hotel', label: 'Hotel', icon: 'hotel' },
  { value: 'translator', label: 'Translator', icon: 'translate' },
  { value: 'affiliate', label: 'Affiliate', icon: 'campaign' },
]

/**
 * AuthForm — simplified signup/login form.
 *
 * Fields:
 *  - Name (signup only, full width)
 *  - Email + Password (2-column grid)
 *  - Role select (signup only, full width)
 *
 * No role-specific fields, no country/city, no Turnstile.
 * Country/city selection moves to provider locations in the dashboard.
 */
export function AuthForm({
  type = 'signup',
  role = 'patient',
  display = 'inline',
  buttonText,
}: AuthFormProps) {
  const router = useRouter()
  const isSignup = type === 'signup'

  // Session check — if user is already logged in, show "already logged in"
  // card instead of the form.
  const [existingSession, setExistingSession] = useState<{ name: string | null; role: string; email: string } | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRole, setSelectedRole] = useState<Role>(role)
  const [submitting, setSubmitting] = useState(false)

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

  // If logged in and type is 'login', auto-redirect to dashboard
  useEffect(() => {
    if (existingSession && type === 'login') {
      router.push('/dashboard')
    }
  }, [existingSession, type, router])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (isSignup && !name.trim()) return

    setSubmitting(true)

    const payload: Record<string, unknown> = {
      email: email.trim(),
      password: password.trim(),
    }

    if (isSignup) {
      payload.name = name.trim()
      payload.role = selectedRole.toUpperCase()
      payload.preferredLanguage = 'en'
    }

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/signin'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Authentication failed')

      toast.success(isSignup ? 'Account created!' : 'Welcome back!')
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  const heading = buttonText || (isSignup ? 'Create your account' : 'Welcome back')
  const ctaLabel = isSignup ? 'Create Account' : 'Sign In'

  // Session check not yet completed — show loading spinner
  if (!sessionChecked) {
    return (
      <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-8')}>
        <div className="flex h-48 items-center justify-center rounded-[16px] border border-divider bg-surface">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-divider border-t-primary" />
        </div>
      </div>
    )
  }

  // User is already logged in — show "already logged in" card
  if (existingSession) {
    return (
      <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-8')}>
        <Card className="overflow-hidden border-divider shadow-xl">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-[14px] bg-success/10 text-success">
                <span className="material-symbols-outlined" style={{ fontSize: 24 }} aria-hidden>
                  check_circle
                </span>
              </div>
              <div>
                <CardTitle className="text-xl">You&apos;re already logged in</CardTitle>
                <CardDescription className="mt-1">
                  Signed in as <strong>{existingSession.name || existingSession.email}</strong> ({existingSession.role})
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="flex-1 gap-2"
                onClick={() => router.push('/dashboard')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>
                  dashboard
                </span>
                Go to Dashboard
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 gap-2 text-error hover:bg-error/5"
                onClick={() => { window.location.href = '/api/auth/signout' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>
                  logout
                </span>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main form
  return (
    <div className={cn('mx-auto w-full max-w-md', display === 'inline' && 'py-8')}>
      <Card className="overflow-hidden border-divider shadow-xl">
        <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent pb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
              <span className="material-symbols-outlined" style={{ fontSize: 24 }} aria-hidden>
                {isSignup ? 'person_add' : 'login'}
              </span>
            </div>
            <div>
              <CardTitle className="text-xl">{heading}</CardTitle>
              <CardDescription className="mt-1">
                {isSignup
                  ? 'Create your Wishubest account in seconds.'
                  : 'Sign in to access your dashboard.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name — signup only */}
            {isSignup && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  className="h-11"
                  required
                />
              </div>
            )}

            {/* Email + Password */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11"
                  required
                />
              </div>
            </div>

            {/* Role select — signup only */}
            {isSignup && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">I want to sign up as a…</Label>
                <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        <span className="flex items-center gap-2">
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                            {r.icon}
                          </span>
                          {r.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              disabled={submitting || !email.trim() || !password.trim() || (isSignup && !name.trim())}
              className="mt-2 h-11 w-full gap-2"
            >
              {submitting ? (
                <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                  {isSignup ? 'person_add' : 'login'}
                </span>
              )}
              {submitting ? 'Please wait…' : ctaLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
