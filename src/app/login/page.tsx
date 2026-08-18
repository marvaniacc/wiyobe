import { AuthForm } from '@/components/auth/auth-form'
import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Login — Wishubest',
  description: 'Sign in to your Wishubest account.',
  robots: { index: false, follow: false },
}

/**
 * /login — standalone login page (not under [locale]).
 *
 * Renders the AuthForm with type="login". After the auth refactor, the
 * legacy AuthScreen was removed from the SPA. This page provides a
 * fixed URL for login that works for all roles (admin, doctor, patient, etc.).
 *
 * The page is noindex (not indexed by search engines) since it's a
 * functional auth page, not content.
 */
export default function LoginPage() {
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

      {/* AuthForm — role defaults to patient, but the signin endpoint
          authenticates against the user's actual role (set during signup).
          The user just needs their email + password. */}
      <AuthForm type="login" role="patient" />

      {/* Footer link */}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
