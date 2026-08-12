import { db } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency } from '@/lib/money'
import {
  getCountryCode,
  getCountryFlag,
  getCountryName,
  getCountrySlug,
} from '@/lib/countries'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type HospitalDetail = {
  id: string
  slug: string | null
  name: string
  description: string
  address: string
  city: string
  country: string
  departments: string
  accreditations: string
  beds: number
  baseFee: string
  languages: string
  verified: boolean
  rating: number
  reviewCount: number
  locations: {
    id: string
    city: string
    country: string
    address: string | null
    isPrimary: boolean
    isActive: boolean
  }[]
  services: { id: string; name: string; description: string; price: string; currency: string; durationMinutes: number | null }[]
}

/**
 * Fetch a single hospital by slug, including its locations and active
 * services. Only verified hospitals whose user has KYC APPROVED status are
 * publicly visible.
 */
async function getHospital(slug: string): Promise<HospitalDetail | null> {
  const hospital = await db.hospital.findUnique({
    where: { slug },
    include: {
      user: { select: { kycStatus: true } },
      locations: {
        where: { isActive: true },
        orderBy: [{ isPrimary: 'desc' }, { city: 'asc' }],
      },
      services: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
      },
    },
  })

  if (!hospital) return null
  if (!hospital.verified) return null
  if (!hospital.slug) return null
  if (hospital.user?.kycStatus !== 'APPROVED') return null

  // Strip the user object — hospital profile doesn't expose it publicly
  const { user: _user, ...publicHospital } = hospital
  void _user
  return publicHospital
}

/**
 * Generate SEO metadata for the hospital detail page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; countrySlug: string; providerSlug: string }>
}): Promise<Metadata> {
  const { locale, countrySlug, providerSlug } = await params
  const hospital = await getHospital(providerSlug)
  if (!hospital) {
    return { title: 'Hospital not found — Wishubest' }
  }

  const countryCode = getCountryCode(countrySlug)
  const countryName = countryCode ? getCountryName(countrySlug.toLowerCase()) || countryCode : countrySlug
  const url = `/${locale}/hospitals/${countrySlug}/${hospital.slug}`
  const metaTitle = `${hospital.name} — Hospital in ${countryName}`
  const metaDescription =
    hospital.description?.slice(0, 160) ||
    `${hospital.name} is a verified hospital based in ${hospital.city}, ${countryName}. Book a consultation on Wishubest.`

  return {
    title: metaTitle,
    description: metaDescription,
    alternates: {
      canonical: url,
      languages: {
        'en': `/en/hospitals/${countrySlug}/${hospital.slug}`,
        'tr': `/tr/hospitals/${countrySlug}/${hospital.slug}`,
        'fa': `/fa/hospitals/${countrySlug}/${hospital.slug}`,
        'ar': `/ar/hospitals/${countrySlug}/${hospital.slug}`,
        'x-default': `/en/hospitals/${countrySlug}/${hospital.slug}`,
      },
    },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      type: 'website',
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDescription,
    },
  }
}

export default async function HospitalDetailPage({
  params,
}: {
  params: Promise<{ locale: string; countrySlug: string; providerSlug: string }>
}) {
  const { locale, countrySlug, providerSlug } = await params

  const countryCode = getCountryCode(countrySlug)
  if (!countryCode) notFound()

  const hospital = await getHospital(providerSlug)
  if (!hospital) notFound()

  // Verify the hospital actually has a presence in the requested country
  const hasCountryMatch =
    hospital.country === countryCode ||
    hospital.locations.some((loc) => loc.country === countryCode)
  if (!hasCountryMatch) notFound()

  const countryName = getCountryName(countrySlug) || countrySlug
  const countryFlag = getCountryFlag(countrySlug)
  const detailCountrySlug = hospital.country ? getCountrySlug(hospital.country) || countrySlug : countrySlug

  const departments = hospital.departments
    ? hospital.departments.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const accreditations = hospital.accreditations
    ? hospital.accreditations.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const languages = hospital.languages
    ? hospital.languages.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <Link
            href={`/${locale}/hospitals/${countrySlug}`}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <span>←</span>
            <span>Hospitals in {countryName}</span>
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

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Profile header */}
        <section className="rounded-[16px] border border-divider bg-surface p-6 sm:p-8">
          <div className="flex flex-col items-start gap-5 sm:flex-row">
            <div className="flex size-24 shrink-0 items-center justify-center rounded-[20px] bg-primary/10 text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 40 }} aria-hidden>
                local_hospital
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{hospital.name}</h1>
                {hospital.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                      verified
                    </span>
                    Verified
                  </span>
                )}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                  location_on
                </span>
                <span className="me-1">{countryFlag}</span>
                {hospital.city}
                {hospital.city && countryName ? ', ' : ''}
                {countryName}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined fill-warning text-warning" style={{ fontSize: 20 }} aria-hidden>
                    star
                  </span>
                  <span className="text-base font-semibold text-foreground">{hospital.rating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">({hospital.reviewCount} reviews)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-muted-foreground" style={{ fontSize: 20 }} aria-hidden>
                    payments
                  </span>
                  <span className="text-xs text-muted-foreground">From</span>
                  <span className="text-base font-semibold text-foreground">
                    {formatCurrency(hospital.baseFee, 'USD', locale)}
                  </span>
                </div>
                {hospital.beds > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-muted-foreground" style={{ fontSize: 20 }} aria-hidden>
                      bed
                    </span>
                    <span className="text-base font-semibold text-foreground">{hospital.beds}</span>
                    <span className="text-sm text-muted-foreground">beds</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Body grid */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column — main content */}
          <div className="space-y-8 lg:col-span-2">
            {hospital.description && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">About</h2>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground">{hospital.description}</p>
              </section>
            )}

            {departments.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Departments</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {departments.map((item, idx) => (
                    <span key={idx} className="rounded-full border border-divider px-3 py-1 text-xs text-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {accreditations.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Accreditations</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {accreditations.map((item, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>
                        workspace_premium
                      </span>
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {hospital.services.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Services</h2>
                <div className="mt-3 space-y-3">
                  {hospital.services.map((service) => (
                    <div
                      key={service.id}
                      className="flex items-start justify-between gap-3 rounded-[14px] border border-divider bg-surface p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{service.name}</p>
                        {service.description && (
                          <p className="mt-0.5 text-sm text-muted-foreground">{service.description}</p>
                        )}
                        {service.durationMinutes != null && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>
                              schedule
                            </span>
                            {service.durationMinutes} minutes
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-semibold text-foreground tabular-nums">
                        {formatCurrency(service.price, service.currency || 'USD', locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {hospital.locations.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Locations</h2>
                <div className="mt-3 space-y-3">
                  {hospital.locations.map((loc) => {
                    const locCountrySlug = getCountrySlug(loc.country)
                    const locCountryName = locCountrySlug
                      ? getCountryName(locCountrySlug.toLowerCase()) || loc.country
                      : loc.country
                    return (
                      <div
                        key={loc.id}
                        className="flex items-start gap-3 rounded-[14px] border border-divider bg-surface p-4"
                      >
                        <span className="material-symbols-outlined mt-0.5 text-primary" style={{ fontSize: 18 }} aria-hidden>
                          place
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">
                              <span className="me-1">{getCountryFlag(loc.country)}</span>
                              {loc.city}
                              {loc.city && locCountryName ? ', ' : ''}
                              {locCountryName}
                            </p>
                            {loc.isPrimary && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                                Primary
                              </span>
                            )}
                          </div>
                          {loc.address && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{loc.address}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Right column — quick facts sidebar */}
          <aside className="space-y-6">
            <div className="rounded-[16px] border border-divider bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking</h2>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Base fee</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(hospital.baseFee, 'USD', locale)}
                  </span>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                  event_available
                </span>
                Book now
              </Link>
            </div>

            <div className="rounded-[16px] border border-divider bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick facts</h2>
              <dl className="mt-3 space-y-3 text-sm">
                {hospital.beds > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Beds</dt>
                    <dd className="font-medium text-foreground">{hospital.beds}</dd>
                  </div>
                )}
                {languages.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Languages</dt>
                    <dd className="font-medium text-foreground">{languages.join(', ')}</dd>
                  </div>
                )}
                {hospital.address && (
                  <div>
                    <dt className="text-muted-foreground">Address</dt>
                    <dd className="font-medium text-foreground">{hospital.address}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="rounded-[16px] border border-divider bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explore</h2>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Link
                  href={`/${locale}/hospitals/${countrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  More hospitals in {countryName}
                </Link>
                <Link
                  href={`/${locale}/hospitals`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  All hospitals
                </Link>
                <Link
                  href={`/${locale}/doctors/${detailCountrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  Doctors in {countryName}
                </Link>
                <Link
                  href={`/${locale}/hotels/${detailCountrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  Hotels in {countryName}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-divider bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Wishubest — Global Medical Tourism Marketplace
          </p>
        </div>
      </footer>
    </div>
  )
}
