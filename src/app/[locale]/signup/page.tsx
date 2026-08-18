import Link from 'next/link'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { translate, type Locale } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = locale as Locale
  return {
    title: translate(loc, 'auth.signup', 'Sign Up') + ' — Wishubest',
    robots: { index: false, follow: false },
  }
}

/**
 * /{locale}/signup — locale-aware signup page.
 *
 * Renders the AuthForm with type='signup' and the current locale.
 * Role is a dropdown INSIDE the form.
 */
export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc = locale as Locale
  const t = (k: string, f: string) => translate(loc, k, f)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-surface-secondary px-4 py-12">
      <Link href={`/${locale}`} className="mb-8 flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }} aria-hidden>monitor_heart</span>
        <span>Wishubest</span>
      </Link>

      <AuthForm type="signup" role="patient" locale={locale} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('auth.haveAccount', 'Already have an account?')}{' '}
        <Link href={`/${locale}/login`} className="font-medium text-primary hover:underline">
          {t('auth.signin', 'Sign in')}
        </Link>
      </p>
    </div>
  )
}
