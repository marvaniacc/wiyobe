'use client'

import { useState } from 'react'
import { AuthForm } from '@/components/auth/auth-form'
import { cn } from '@/lib/utils'

const ROLES = [
  { key: 'patient', label: 'Patient', icon: 'personal_injury', color: 'bg-primary/10 text-primary' },
  { key: 'doctor', label: 'Doctor', icon: 'medical_services', color: 'bg-success/10 text-success' },
  { key: 'hospital', label: 'Hospital', icon: 'local_hospital', color: 'bg-info/10 text-info' },
  { key: 'hotel', label: 'Hotel', icon: 'hotel', color: 'bg-warning/10 text-warning' },
  { key: 'translator', label: 'Translator', icon: 'translate', color: 'bg-error/10 text-error' },
  { key: 'affiliate', label: 'Affiliate', icon: 'campaign', color: 'bg-[#9334E6]/10 text-[#9334E6]' },
] as const

/**
 * SignupClient — client component for the /signup page.
 *
 * Renders a role selector (6 buttons). When a role is selected, renders
 * the <AuthForm type="signup" role={selectedRole} /> below.
 */
export function SignupClient() {
  const [selectedRole, setSelectedRole] = useState<string>('patient')

  return (
    <div className="w-full max-w-2xl">
      {/* Role selector */}
      <div className="mb-6">
        <p className="mb-3 text-center text-sm font-medium text-muted-foreground">
          I want to sign up as a…
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <button
              key={r.key}
              onClick={() => setSelectedRole(r.key)}
              className={cn(
                'flex items-center gap-2 rounded-[12px] border p-3 text-sm font-medium transition-all',
                selectedRole === r.key
                  ? 'border-primary bg-primary/5 text-primary shadow-sm'
                  : 'border-divider bg-surface text-muted-foreground hover:border-primary/40 hover:bg-surface-secondary'
              )}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>
                {r.icon}
              </span>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* AuthForm with selected role */}
      <AuthForm type="signup" role={selectedRole as any} />
    </div>
  )
}
