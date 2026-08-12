import { db } from '@/lib/db'
import Link from 'next/link'
import { formatCurrency } from '@/lib/money'
import { getCountryFlag, getCountryName, getCountrySlug } from '@/lib/countries'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Translators — Wishubest Medical Tourism',
  description:
    'Browse verified medical translators offering translation services worldwide. Compare specializations, ratings, and hourly rates.',
  openGraph: {
    title: 'Verified Translators — Wishubest Medical Tourism',
    description:
      'Browse verified medical translators offering translation services worldwide.',
    type: 'website',
  },
}

type TranslatorCard = {
  id: string
  slug: string | null
  specialization: string
  city: string
  country: string
  hourlyRate: string
  rating: number
  reviewCount: number
  spokenLanguages: string
  user: { name: string | null; avatarUrl: string | null } | null
  locations: { id: string; city: string; country: string; isPrimary: boolean; isActive: boolean }[]
}

/**
 * Public SSR route — renders a card grid of ALL verified translators whose
 * associated User has KYC APPROVED status.
 */
export default async function TranslatorsListPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  const translators: TranslatorCard[] = await db.translator.findMany({
    where: {
      verified: true,
      user: { kycStatus: 'APPROVED' },
      slug: { not: null },
    },
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    select: {
      id: true,
      slug: true,
      specialization: true,
      city: true,
      country: true,
      hourlyRate: true,
      rating: true,
      reviewCount: true,
      spokenLanguages: true,
      user: { select: { name: true, avatarUrl: true } },
      locations: {
        where: { isActive: true },
        select: { id: true, city: true, country: true, isPrimary: true, isActive: true },
      },
    },
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary">
            <span className="text-primary">↩</span>
            <span>Wishubest</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href={`/${locale}/blog`}
              className="rounded-full border border-divider px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Blog
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-divider px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-divider bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Verified Translators
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Browse medical translators offering translation services for patients travelling abroad.
            Compare specializations, ratings, and hourly rates.
          </p>
        </div>
      </section>

      {/* Provider type nav */}
      <div className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 py-3 sm:px-6">
          <Link href={`/${locale}/doctors`} className="rounded-full border border-divider px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">Doctors</Link>
          <Link href={`/${locale}/hospitals`} className="rounded-full border border-divider px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">Hospitals</Link>
          <Link href={`/${locale}/hotels`} className="rounded-full border border-divider px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">Hotels</Link>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Translators</span>
        </div>
      </div>

      {/* Cards grid */}
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {translators.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-divider bg-surface py-16 text-center">
            <span className="material-symbols-outlined text-muted-foreground/50" style={{ fontSize: 48 }}>
              translate
            </span>
            <h2 className="text-lg font-semibold text-foreground">No translators available</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Verified translator profiles will appear here soon. Please check back later.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {translators.map((translator) => {
              const countrySlug = translator.country ? getCountrySlug(translator.country) : null
              const href =
                translator.slug && countrySlug
                  ? `/${locale}/translators/${countrySlug}/${translator.slug}`
                  : `/${locale}/translators`
              const flag = getCountryFlag(translator.country || '')
              const displayCountry = translator.country
                ? getCountryName(translator.country.toLowerCase()) || translator.country
                : translator.country
              const spokenLanguages = translator.spokenLanguages
                ? translator.spokenLanguages.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3)
                : []
              return (
                <Link
                  key={translator.id}
                  href={href}
                  className="group flex flex-col rounded-[16px] border border-divider bg-surface p-5 transition-all hover:border-primary/30 hover:shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    {translator.user?.avatarUrl ? (
                      <img
                        src={translator.user.avatarUrl}
                        alt={translator.user.name || 'Translator'}
                        className="size-14 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                        {(translator.user?.name || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-1 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                        {translator.user?.name || 'Unnamed translator'}
                      </h2>
                      <p className="line-clamp-1 text-sm text-muted-foreground capitalize">
                        {translator.specialization} translator
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        <span className="me-1">{flag}</span>
                        {translator.city}
                        {translator.city && displayCountry ? ', ' : ''}
                        {displayCountry}
                      </p>
                    </div>
                  </div>

                  {spokenLanguages.length > 0 && (
                    <p className="mt-3 line-clamp-1 text-xs text-muted-foreground">
                      <span className="material-symbols-outlined align-middle text-primary" style={{ fontSize: 12 }} aria-hidden>
                        language
                      </span>{' '}
                      Speaks: {spokenLanguages.join(', ')}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-divider pt-4">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined fill-warning text-warning" style={{ fontSize: 16 }}>
                        star
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {translator.rating.toFixed(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">({translator.reviewCount})</span>
                    </div>
                    <div className="text-end">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">From / hour</p>
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(translator.hourlyRate, 'USD', locale)}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-divider bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Wishubest — Global Medical Tourism Marketplace
          </p>
        </div>
      </footer>
    </div>
  )
}
