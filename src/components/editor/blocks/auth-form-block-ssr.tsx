import Link from 'next/link'

type AuthFormBlockSSRProps = {
  type: 'login' | 'signup'
  role: 'patient' | 'doctor' | 'hospital' | 'hotel' | 'translator' | 'affiliate'
  display: 'inline' | 'modal'
  buttonText: string
}

const ROLE_LABELS: Record<string, string> = {
  patient: 'Patient', doctor: 'Doctor', hospital: 'Hospital',
  hotel: 'Hotel / Suite', translator: 'Translator', affiliate: 'Affiliate',
}

export function AuthFormBlockSSR({ type, role, display, buttonText }: AuthFormBlockSSRProps) {
  const isSignup = type === 'signup'
  const heading = isSignup ? `Sign up as a ${ROLE_LABELS[role]}` : 'Welcome back'
  const ctaLabel = buttonText || (isSignup ? 'Create Account' : 'Sign In')
  const dashUrl = `/dashboard?auth=${type}&role=${role}`

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-[24px] border border-divider bg-surface p-8 shadow-[0_1px_3px_rgba(60,64,67,0.08)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
            <span className="material-symbols-outlined" style={{ fontSize: 28 }} aria-hidden>{isSignup ? 'person_add' : 'login'}</span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground">{heading}</h2>
        </div>
        <form action={dashUrl} method="get" className="space-y-4">
          <input type="hidden" name="auth" value={type} />
          <input type="hidden" name="role" value={role} />
          {isSignup && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <input name="name" type="text" placeholder="Jane Doe" className="flex h-12 w-full rounded-[14px] border border-input bg-background px-3.5 text-sm" />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input name="email" type="email" placeholder="you@example.com" className="flex h-12 w-full rounded-[14px] border border-input bg-background px-3.5 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Password</label>
            <input name="password" type="password" placeholder="••••••••" className="flex h-12 w-full rounded-[14px] border border-input bg-background px-3.5 text-sm" />
          </div>
          <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>{isSignup ? 'mail' : 'login'}</span>
            {ctaLabel}
          </button>
        </form>
        <div className="mt-5 text-center text-sm text-muted-foreground">
          {isSignup ? <>Already have an account?{' '}<Link href={`/dashboard?auth=signin&role=${role}`} className="font-medium text-primary hover:underline">Sign in</Link></>
          : <>Don't have an account?{' '}<Link href={`/dashboard?auth=signup&role=${role}`} className="font-medium text-primary hover:underline">Sign up</Link></>}
        </div>
      </div>
    </div>
  )
}
