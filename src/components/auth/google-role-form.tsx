'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/shared/icon'
import { GoogleIcon } from '@/components/shared/google-icon'
import { toast } from 'sonner'
import { translate, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Role = 'patient' | 'doctor' | 'hospital' | 'hotel' | 'translator' | 'affiliate'

const ROLE_OPTIONS: { value: Role; labelKey: string; descKey: string; icon: string; descFallback: string }[] = [
  { value: 'patient', labelKey: 'role.patient', descKey: 'auth.roleDesc.patient', icon: 'personal_injury', descFallback: 'Book treatments and manage your care journey' },
  { value: 'doctor', labelKey: 'role.doctor', descKey: 'auth.roleDesc.doctor', icon: 'medical_services', descFallback: 'Offer consultations and medical services' },
  { value: 'hospital', labelKey: 'role.hospital', descKey: 'auth.roleDesc.hospital', icon: 'local_hospital', descFallback: 'List your hospital or clinic' },
  { value: 'hotel', labelKey: 'role.hotel', descKey: 'auth.roleDesc.hotel', icon: 'hotel', descFallback: 'Host patients and their families' },
  { value: 'translator', labelKey: 'role.translator', descKey: 'auth.roleDesc.translator', icon: 'translate', descFallback: 'Provide medical translation services' },
  { value: 'affiliate', labelKey: 'role.affiliate', descKey: 'auth.roleDesc.affiliate', icon: 'campaign', descFallback: 'Promote Wishubest and earn commissions' },
]

/**
 * GoogleRoleForm — final step of Google signup: the identity is already
 * verified server-side; the user picks their role and the account is
 * created. Role choice is presented as a shadcn new-york style selectable
 * card grid (wide, not a cramped dropdown).
 */
export function GoogleRoleForm({ locale }: { locale: string }) {
  const router = useRouter()
  const loc = locale as Locale
  const t = (key: string, fallback: string) => translate(loc, key, fallback)

  const [token, setToken] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tk = params.get('token') || ''
    if (!tk || tk.length < 20) {
      toast.error(t('auth.sessionExpired', 'This signup session expired. Please sign in with Google again.'))
      router.replace(`/${loc}/login`)
      return
    }
    setToken(tk)
  }, [loc, router, t])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!role) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/google/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, role: role.toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('auth.authFailed', 'Authentication failed'))
      toast.success(t('auth.accountCreated', 'Account created!'))
      router.push(data.redirect || '/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || t('auth.authFailed', 'Authentication failed'))
      // Expired/unknown session — send the user back to start over.
      if (/expired/i.test(err.message || '')) {
        setTimeout(() => router.replace(`/${loc}/login`), 1800)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full overflow-hidden border-divider shadow-xl">
      <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent px-6 pb-4 pt-6 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
            <GoogleIcon size={22} />
          </div>
          <div>
            <CardTitle className="text-xl">{t('auth.chooseRole', 'Choose your role')}</CardTitle>
            <CardDescription className="mt-0.5">
              {t('auth.chooseRoleDesc', 'Google verified — pick how you want to use Wishubest.')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div role="radiogroup" aria-label={t('auth.rolePrompt', 'I want to sign up as a…')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ROLE_OPTIONS.map((r) => {
              const selected = role === r.value
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRole(r.value)}
                  className={cn(
                    'relative flex flex-col items-start gap-2 rounded-[14px] border p-4 text-start transition-all',
                    selected
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                      : 'border-divider bg-surface hover:border-primary/40 hover:bg-accent/40'
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <div
                      className={cn(
                        'flex size-9 items-center justify-center rounded-[10px] transition-colors',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                      )}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>{r.icon}</span>
                    </div>
                    {selected && (
                      <span className="material-symbols-outlined fill-current text-primary" style={{ fontSize: 20 }} aria-hidden>
                        check_circle
                      </span>
                    )}
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-foreground')}>
                      {t(r.labelKey, r.value)}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {t(r.descKey, r.descFallback)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <Button type="submit" disabled={submitting || !role} size="lg" className="h-11 w-full gap-2">
            {submitting ? (
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>person_add</span>
            )}
            {submitting
              ? t('auth.pleaseWait', 'Please wait…')
              : t('auth.createAccountAs', 'Create account').replace('{role}', role ? t(`role.${role}`, role) : '')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
