import Link from 'next/link'
import type { Metadata } from 'next'
import { GoogleRoleForm } from '@/components/auth/google-role-form'
import { translate, type Locale } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = locale as Locale
  return {
    title: translate(loc, 'auth.chooseRole', 'Choose your role') + ' — Wishubest',
    robots: { index: false, follow: false },
  }
}

/**
 * /{locale}/complete-signup — final step of Google signup.
 *
 * The user arrives here from the OAuth callback with a short-lived token
 * referencing their server-side verified Google identity; they pick a role
 * and the account is created (see /api/auth/google/complete).
 */
export default async function CompleteSignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const loc = locale as Locale

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-background to-surface-secondary px-4 py-8">
      <Link href={`/${locale}`} className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }} aria-hidden>monitor_heart</span>
        <span>Wishubest</span>
      </Link>

      <div className="w-full max-w-4xl px-0 sm:px-2"><GoogleRoleForm locale={locale} /></div>
    </div>
  )
}
