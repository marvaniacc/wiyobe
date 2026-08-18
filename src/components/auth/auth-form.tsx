'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Icon } from '@/components/shared/icon'
import { toast } from 'sonner'
import { LANGUAGES } from '@/lib/languages'
import { cn } from '@/lib/utils'

type AuthType = 'login' | 'signup'
type Role = 'patient' | 'doctor' | 'hospital' | 'hotel' | 'translator' | 'affiliate'

type Country = { id: string; name: string; isoCode: string; flag?: string | null }
type City = { id: string; name: string }

// Extend window for Turnstile
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: {
        sitekey: string
        callback: (token: string) => void
        'error-callback'?: () => void
        theme?: 'light' | 'dark' | 'auto'
      }) => string
      reset: (id?: string) => void
      remove: (id: string) => void
    }
  }
}

type AuthFormProps = {
  type?: AuthType
  role?: Role
  display?: 'inline' | 'modal'
  buttonText?: string
}

const ROLE_LABELS: Record<Role, string> = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital: 'Hospital',
  hotel: 'Hotel / Suite',
  translator: 'Translator',
  affiliate: 'Affiliate',
}

/**
 * AuthForm — premium shadcn/ui Card layout for signup/signin.
 *
 * Features:
 *  - 2-column grid for inputs (sm:grid-cols-2)
 *  - Role-specific fields (DOCTOR: license+specialty, HOTEL: star rating, etc.)
 *  - Dynamic Country + City dropdowns (fetched from /api/admin/locations)
 *  - TRANSLATOR: language tag input (multi-select from LANGUAGES list)
 *  - Cloudflare Turnstile anti-bot widget
 *  - Redirects to /dashboard on success
 */
export function AuthForm({
  type = 'signup',
  role = 'patient',
  display = 'inline',
  buttonText,
}: AuthFormProps) {
  const router = useRouter()
  const isSignup = type === 'signup'
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [medicalLicenseNumber, setMedicalLicenseNumber] = useState('')
  const [businessRegNumber, setBusinessRegNumber] = useState('')
  const [starRating, setStarRating] = useState('3')
  const [specialization, setSpecialization] = useState('')
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])

  // Location state
  const [countries, setCountries] = useState<Country[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [countryId, setCountryId] = useState('')
  const [cityId, setCityId] = useState('')
  const [countryName, setCountryName] = useState('')
  const [cityName, setCityName] = useState('')

  // Turnstile token
  const [cfToken, setCfToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Fetch countries on mount
  useEffect(() => {
    fetch('/api/admin/locations')
      .then((r) => r.json())
      .then((data) => {
        if (data.countries) setCountries(data.countries)
      })
      .catch(() => {})
  }, [])

  // Fetch cities when country changes
  useEffect(() => {
    if (!countryId) {
      setCities([])
      return
    }
    fetch(`/api/admin/locations?countryId=${countryId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.cities) setCities(data.cities)
      })
      .catch(() => setCities([]))
  }, [countryId])

  // Load Turnstile widget
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY
    if (!siteKey || !turnstileRef.current) return

    function tryRender() {
      if (window.turnstile && turnstileRef.current) {
        try {
          turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
            sitekey: siteKey,
            callback: (token: string) => setCfToken(token),
            'error-callback': () => setCfToken(''),
            theme: 'light',
          })
        } catch {
          /* Turnstile not ready */
        }
      }
    }

    // Load script if needed
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = () => tryRender()
      document.head.appendChild(script)
    } else {
      tryRender()
    }

    // Poll for turnstile to be ready (script might still be loading)
    const interval = setInterval(() => {
      if (window.turnstile && !turnstileWidgetId.current) {
        tryRender()
        if (turnstileWidgetId.current) clearInterval(interval)
      }
    }, 500)

    return () => {
      clearInterval(interval)
      if (turnstileWidgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetId.current)
        } catch { /* ignore */ }
      }
    }
  }, [])

  function toggleLanguage(code: string) {
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (isSignup && !name.trim()) return

    // Require Turnstile token (only if site key is configured)
    const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY
    if (siteKey && !cfToken) {
      toast.error('Please complete the security verification.')
      return
    }

    setSubmitting(true)

    const payload: Record<string, unknown> = {
      email: email.trim(),
      password: password.trim(),
      role: role.toUpperCase(),
      cfToken,
    }

    if (isSignup) {
      payload.name = name.trim()
      payload.preferredLanguage = 'en'
      if (phone) payload.phone = phone.trim()
      if (countryId) payload.countryId = countryId
      if (cityId) payload.cityId = cityId
      if (countryName) payload.country = countryName
      if (cityName) payload.city = cityName
      if (specialty) payload.specialty = specialty.trim()
      if (medicalLicenseNumber) payload.medicalLicenseNumber = medicalLicenseNumber.trim()
      if (businessRegNumber) payload.businessRegNumber = businessRegNumber.trim()
      if (starRating) payload.starRating = parseInt(starRating)
      if (specialization) payload.specialization = specialization.trim()
      if (selectedLanguages.length > 0) payload.languages = selectedLanguages.join(',')
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
      // Reset Turnstile on error
      if (turnstileWidgetId.current && window.turnstile) {
        try { window.turnstile.reset(turnstileWidgetId.current) } catch { /* ignore */ }
      }
      setCfToken('')
    } finally {
      setSubmitting(false)
    }
  }

  const heading = buttonText || (isSignup ? `Sign up as a ${ROLE_LABELS[role]}` : 'Welcome back')
  const ctaLabel = isSignup ? 'Create Account' : 'Sign In'

  return (
    <div className={cn('mx-auto w-full max-w-2xl', display === 'inline' && 'py-8')}>
      <Card className="overflow-hidden border-divider shadow-xl">
        {/* Header with gradient */}
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
            {/* Name — full width for signup */}
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

            {/* Email + Password — 2 columns */}
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

            {/* Role-specific fields */}
            {isSignup && role === 'patient' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {isSignup && role === 'doctor' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Medical License Number</Label>
                  <Input
                    value={medicalLicenseNumber}
                    onChange={(e) => setMedicalLicenseNumber(e.target.value)}
                    placeholder="ML-12345678"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Specialty</Label>
                  <Input
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    placeholder="Cardiology"
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {isSignup && role === 'hospital' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Business Registration Number</Label>
                  <Input
                    value={businessRegNumber}
                    onChange={(e) => setBusinessRegNumber(e.target.value)}
                    placeholder="BR-12345678"
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {isSignup && role === 'hotel' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Star Rating</Label>
                  <Select value={starRating} onValueChange={setStarRating}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <SelectItem key={s} value={String(s)}>{'★'.repeat(s)} {s} Star{s > 1 ? 's' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Business Registration Number</Label>
                  <Input
                    value={businessRegNumber}
                    onChange={(e) => setBusinessRegNumber(e.target.value)}
                    placeholder="BR-12345678"
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {isSignup && role === 'translator' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Specialization</Label>
                    <Input
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      placeholder="Medical, Legal, General"
                      className="h-11"
                    />
                  </div>
                </div>
                {/* Language tag input */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Languages</Label>
                  <div className="flex flex-wrap gap-2 rounded-[12px] border border-input bg-background p-3">
                    {selectedLanguages.map((code) => {
                      const lang = LANGUAGES.find((l) => l.code === code)
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => toggleLanguage(code)}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                          {lang?.name || code}
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>close</span>
                        </button>
                      )
                    })}
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) toggleLanguage(e.target.value) }}
                      className="border-0 bg-transparent text-sm text-muted-foreground outline-none"
                    >
                      <option value="">+ Add language…</option>
                      {LANGUAGES.filter((l) => !selectedLanguages.includes(l.code)).map((l) => (
                        <option key={l.code} value={l.code}>{l.name} ({l.native})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Country + City dropdowns — all roles for signup */}
            {isSignup && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Country</Label>
                  <Select
                    value={countryId}
                    onValueChange={(v) => {
                      const c = countries.find((c) => c.id === v)
                      setCountryId(v)
                      setCountryName(c?.name || '')
                      setCityId('')
                      setCityName('')
                    }}
                  >
                    <SelectTrigger className="h-11"><SelectValue placeholder="Select country…" /></SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.flag ? `${c.flag} ` : ''}{c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">City</Label>
                  <Select
                    value={cityId}
                    onValueChange={(v) => {
                      const c = cities.find((c) => c.id === v)
                      setCityId(v)
                      setCityName(c?.name || '')
                    }}
                    disabled={!countryId || cities.length === 0}
                  >
                    <SelectTrigger className="h-11"><SelectValue placeholder={countryId ? 'Select city…' : 'Select country first'} /></SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Turnstile widget */}
            {process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY && (
              <div className="flex justify-center pt-2">
                <div ref={turnstileRef} />
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              disabled={submitting || (!!process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY && !cfToken)}
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
