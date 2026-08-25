import Link from 'next/link'
import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { translate, type Locale } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const loc = locale as Locale
  return {
    title: translate(loc, 'auth.signin', 'Sign In') + ' — Wishubest',
    robots: { index: false, follow: false },
  }
}

/**
 * /{locale}/login — locale-aware login page.
 *
 * Renders the AuthForm with type='login' and the current locale.
 * All labels are translated via the i18n dict.
 */
export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ redirect?: string }> }) {
  const { locale } = await params
  const { redirect } = await searchParams
  const loc = locale as Locale
  const t = (k: string, f: string) => translate(loc, k, f)

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-background to-surface-secondary px-4 py-8">
      <Link href={`/${locale}`} className="mb-6 flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: 28 }} aria-hidden>monitor_heart</span>
        <span>Wishubest</span>
      </Link>

      <AuthForm type="login" locale={locale} redirectPath={redirect} />
    </div>
  )
}
