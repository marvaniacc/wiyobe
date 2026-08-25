'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Icon } from '@/components/shared/icon'
import { GoogleIcon } from '@/components/shared/google-icon'
import { toast } from 'sonner'
import { translate, type Locale } from '@/lib/i18n'

type Role = 'patient' | 'doctor' | 'hospital' | 'hotel' | 'translator' | 'affiliate'

const ROLE_OPTIONS: { value: Role; labelKey: string; icon: string }[] = [
  { value: 'patient', labelKey: 'role.patient', icon: 'personal_injury' },
  { value: 'doctor', labelKey: 'role.doctor', icon: 'medical_services' },
  { value: 'hospital', labelKey: 'role.hospital', icon: 'local_hospital' },
  { value: 'hotel', labelKey: 'role.hotel', icon: 'hotel' },
  { value: 'translator', labelKey: 'role.translator', icon: 'translate' },
  { value: 'affiliate', labelKey: 'role.affiliate', icon: 'campaign' },
]

/**
 * GoogleRoleForm — final step of Google signup: the identity is already
 * verified server-side; the user chooses their role and the account is
 * created. Follows the same Card/Select/Button patterns as AuthForm.
 */
export function GoogleRoleForm({ locale }: { locale: string }) {
  const router = useRouter()
  const loc = locale as Locale
  const t = (key: string, fallback: string) => translate(loc, key, fallback)

  const [token, setToken] = useState('')
  const [role, setRole] = useState<Role>('patient')
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
    <Card className="overflow-hidden border-divider shadow-xl">
      <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent px-6 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
            <GoogleIcon size={20} />
          </div>
          <div>
            <CardTitle className="text-lg">{t('auth.chooseRole', 'Choose your role')}</CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {t('auth.chooseRoleDesc', 'Google verified — pick how you want to use Wishubest.')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('auth.rolePrompt', 'I want to sign up as a…')}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
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

          <Button type="submit" disabled={submitting || !token} className="h-11 w-full gap-2">
            {submitting ? (
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>person_add</span>
            )}
            {t('auth.createBtn', 'Create Account')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
