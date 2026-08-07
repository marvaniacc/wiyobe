'use client'
import { useState, useEffect } from 'react'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiPost } from '@/hooks/use-api'
import { COUNTRIES } from '@/lib/countries'
import { DOCTOR_SPECIALTIES } from '@/lib/specialties'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

export function AuthModal({ open, onOpenChange, mode, setMode, role, onSuccess }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: 'signin' | 'signup'
  setMode: (m: 'signin' | 'signup') => void
  role: string
  onSuccess: (user: any) => void
}) {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [languages, setLanguages] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setEmail(''); setPassword(''); setName(''); setCountry(''); setCity(''); setSpecialty(''); setLanguages('')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signin') {
        const res = await apiPost('/api/auth/signin', { email, password })
        toast.success(t('auth.welcomeBack'))
        onOpenChange(false)
        onSuccess(res.user)
      } else {
        const refCode = typeof window !== 'undefined' ? localStorage.getItem('mt_ref_code') : null
        const body: any = { email, password, role, name, preferredLanguage: 'en', country, city }
        if (role === 'DOCTOR') body.specialty = specialty
        if (['DOCTOR', 'TRANSLATOR', 'HOSPITAL', 'HOTEL'].includes(role)) body.languages = languages || 'en'
        if (refCode) body.referralCode = refCode
        const res = await apiPost('/api/auth/signup', body)
        if (res.needsApproval) {
          toast.success('Account created! Pending admin approval. You can sign in once approved.')
          setMode('signin')
        } else {
          toast.success(t('auth.welcome'))
          onOpenChange(false)
          onSuccess(res.user)
        }
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {mode === 'signin' ? t('auth.welcomeBack') : `Join as ${role.toLowerCase()}`}
          </DialogTitle>
          <DialogDescription className="text-center">
            {mode === 'signin' ? t('auth.signInToContinue') : t('auth.createAccount')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="r-name">{t('common.name')}</Label>
              <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="r-email">{t('common.email')}</Label>
            <Input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-pw">{t('common.password')}</Label>
            <Input id="r-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
          </div>

          {mode === 'signup' && (
            <>
              <div className="space-y-1.5">
                <Label>{t('common.country')}</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-city">{t('common.city')}</Label>
                <Input id="r-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Istanbul" />
              </div>
              {role === 'DOCTOR' && (
                <div className="space-y-1.5">
                  <Label>{t('common.specialty')}</Label>
                  <Select value={specialty} onValueChange={setSpecialty}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {DOCTOR_SPECIALTIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {['DOCTOR', 'TRANSLATOR', 'HOSPITAL', 'HOTEL'].includes(role) && (
                <div className="space-y-1.5">
                  <Label htmlFor="r-lang">{t('common.languages')}</Label>
                  <Input id="r-lang" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, tr, fa, ar" />
                </div>
              )}
            </>
          )}

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? <span className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : (mode === 'signin' ? t('common.signin') : t('common.signup'))}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
          <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="font-medium text-primary hover:underline">
            {mode === 'signin' ? t('common.signup') : t('common.signin')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
