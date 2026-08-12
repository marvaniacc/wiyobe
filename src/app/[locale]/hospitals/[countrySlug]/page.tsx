import { db } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency } from '@/lib/money'
import { getCountryCode, getCountryFlag, getCountryName, getCountrySlug } from '@/lib/countries'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type HospitalCard = {
  id: string
  slug: string | null
  name: string
  city: string
  country: string
  departments: string
  baseFee: string
  rating: number
  reviewCount: number
  locations: { id: string; city: string; country: string; isPrimary: boolean; isActive: boolean }[]
}

/**
 * Public SSR route — renders a card grid of verified hospitals located in the
 * requested country (matched either by the hospital's primary `country` field
 * OR by an active ProviderLocation row in that country).
 */
export default async function HospitalsByCountryPage({
  params,
}: {
  params: Promise<{ locale: string; countrySlug: string }>
}) {
  const { locale, countrySlug } = await params

  const countryCode = getCountryCode(countrySlug)
  if (!countryCode) notFound()

  const countryName = getCountryName(countrySlug) || countrySlug
  const countryFlag = getCountryFlag(countrySlug)

  const hospitals: HospitalCard[] = await db.hospital.findMany({
    where: {
      verified: true,
      user: { kycStatus: 'APPROVED' },
      slug: { not: null },
      OR: [
        { country: countryCode },
        { locations: { some: { country: countryCode, isActive: true } } },
      ],
    },
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      country: true,
      departments: true,
      baseFee: true,
      rating: true,
      reviewCount: true,
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
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/${locale}/hospitals`} className="transition-colors hover:text-primary">
              ← All hospitals
            </Link>
          </div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            <span className="text-4xl">{countryFlag}</span>
            Hospitals in {countryName}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Verified hospitals offering medical tourism services in {countryName}.
          </p>
        </div>
      </section>

      {/* Provider type nav */}
      <div className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 py-3 sm:px-6">
          <Link href={`/${locale}/doctors/${countrySlug}`} className="rounded-full border border-divider px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">Doctors</Link>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Hospitals</span>
          <Link href={`/${locale}/hotels/${countrySlug}`} className="rounded-full border border-divider px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">Hotels</Link>
          <Link href={`/${locale}/translators/${countrySlug}`} className="rounded-full border border-divider px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">Translators</Link>
        </div>
      </div>

      {/* Cards grid */}
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {hospitals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-divider bg-surface py-16 text-center">
            <span className="material-symbols-outlined text-muted-foreground/50" style={{ fontSize: 48 }}>
              local_hospital
            </span>
            <h2 className="text-lg font-semibold text-foreground">No hospitals in {countryName}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              We don&apos;t have any verified hospital profiles in {countryName} yet. Try browsing all countries.
            </p>
            <Link
              href={`/${locale}/hospitals`}
              className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Browse all hospitals
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {hospitals.map((hospital) => {
              const detailCountrySlug = hospital.country ? getCountrySlug(hospital.country) : countrySlug
              const href =
                hospital.slug && detailCountrySlug
                  ? `/${locale}/hospitals/${detailCountrySlug}/${hospital.slug}`
                  : `/${locale}/hospitals/${countrySlug}`
              const departments = hospital.departments
                ? hospital.departments.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3)
                : []
              return (
                <Link
                  key={hospital.id}
                  href={href}
                  className="group flex flex-col rounded-[16px] border border-divider bg-surface p-5 transition-all hover:border-primary/30 hover:shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="material-symbols-outlined" style={{ fontSize: 28 }} aria-hidden>
                        local_hospital
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-1 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                        {hospital.name}
                      </h2>
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {departments.length > 0 ? departments.join(', ') : 'Hospital'}
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        <span className="me-1">{countryFlag}</span>
                        {hospital.city}
                        {hospital.city && countryName ? ', ' : ''}
                        {countryName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-divider pt-4">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined fill-warning text-warning" style={{ fontSize: 16 }}>
                        star
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {hospital.rating.toFixed(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">({hospital.reviewCount})</span>
                    </div>
                    <div className="text-end">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">From</p>
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(hospital.baseFee, 'USD', locale)}
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
