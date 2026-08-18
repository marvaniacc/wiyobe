import { SignupClient } from '@/components/auth/signup-client'
import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign Up — Wishubest',
  description: 'Create your Wishubest account as a patient, doctor, hospital, hotel, or translator.',
  robots: { index: false, follow: false },
}

/**
 * /signup — standalone signup page with role selector.
 *
 * Shows role buttons (Patient, Doctor, Hospital, Hotel, Translator, Affiliate).
 * Clicking a role renders the AuthForm with that role pre-filled.
 *
 * This is a FIXED-URL fallback that always works — even if shortcode-based
 * auth on Custom Pages isn't set up.
 */
export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-surface-secondary px-4 py-12">
      {/* Logo */}
      <Link
        href="/en"
        className="mb-8 flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary"
      >
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }} aria-hidden>
          monitor_heart
        </span>
        <span>Wishubest</span>
      </Link>

      {/* Role selector + AuthForm */}
      <SignupClient />

      {/* Login link */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
