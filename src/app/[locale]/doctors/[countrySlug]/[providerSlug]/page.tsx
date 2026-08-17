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

type DoctorDetail = {
  id: string
  slug: string | null
  specialty: string
  subSpecialties: string
  bio: string
  city: string
  country: string
  yearsExperience: number
  consultationFee: string
  onlineFee: string
  languages: string
  education: string
  certifications: string
  verified: boolean
  rating: number
  reviewCount: number
  user: { name: string | null; avatarUrl: string | null } | null
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
 * Fetch a single doctor by slug, including its user, locations and active
 * services. Only verified doctors whose user has KYC APPROVED status are
 * publicly visible — everything else triggers a 404 via notFound().
 */
async function getDoctor(slug: string): Promise<DoctorDetail | null> {
  const doctor = await db.doctor.findUnique({
    where: { slug },
    include: {
      user: { select: { name: true, avatarUrl: true, kycStatus: true } },
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

  if (!doctor) return null
  if (!doctor.verified) return null
  if (!doctor.slug) return null
  if (doctor.user?.kycStatus !== 'APPROVED') return null

  // Strip kycStatus from the user object so it matches the public type
  const { kycStatus: _kyc, ...publicUser } = doctor.user
  void _kyc
  return { ...doctor, user: publicUser }
}

/**
 * Generate SEO metadata for the doctor detail page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; countrySlug: string; providerSlug: string }>
}): Promise<Metadata> {
  const { locale, countrySlug, providerSlug } = await params
  const doctor = await getDoctor(providerSlug)
  if (!doctor) {
    return { title: 'Doctor not found — Wishubest' }
  }

  const name = doctor.user?.name || 'Doctor'
  const countryCode = getCountryCode(countrySlug)
  const countryName = countryCode ? getCountryName(countrySlug.toLowerCase()) || countryCode : countrySlug
  const url = `/${locale}/doctors/${countrySlug}/${doctor.slug}`
  const metaTitle = `${name} — ${doctor.specialty} in ${countryName}`
  const metaDescription =
    doctor.bio?.slice(0, 160) ||
    `${name} is a verified ${doctor.specialty} based in ${doctor.city}, ${countryName}. Book a consultation on Wishubest.`

  const images = doctor.user?.avatarUrl
    ? [{ url: doctor.user.avatarUrl, width: 400, height: 400, alt: name }]
    : undefined

  return {
    title: metaTitle,
    description: metaDescription,
    alternates: {
      canonical: url,
      languages: {
        'en': `/en/doctors/${countrySlug}/${doctor.slug}`,
        'tr': `/tr/doctors/${countrySlug}/${doctor.slug}`,
        'fa': `/fa/doctors/${countrySlug}/${doctor.slug}`,
        'ar': `/ar/doctors/${countrySlug}/${doctor.slug}`,
        'ru': `/ru/doctors/${countrySlug}/${doctor.slug}`,
        'x-default': `/en/doctors/${countrySlug}/${doctor.slug}`,
      },
    },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      type: 'profile',
      url,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDescription,
      images,
    },
  }
}

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; countrySlug: string; providerSlug: string }>
}) {
  const { locale, countrySlug, providerSlug } = await params

  // Validate country slug first → 404 if unknown
  const countryCode = getCountryCode(countrySlug)
  if (!countryCode) notFound()

  const doctor = await getDoctor(providerSlug)
  if (!doctor) notFound()

  // Verify the doctor actually has a presence in the requested country
  const hasCountryMatch =
    doctor.country === countryCode ||
    doctor.locations.some((loc) => loc.country === countryCode)
  if (!hasCountryMatch) notFound()

  const countryName = getCountryName(countrySlug) || countrySlug
  const countryFlag = getCountryFlag(countrySlug)
  const name = doctor.user?.name || 'Unnamed doctor'
  const detailCountrySlug = doctor.country ? getCountrySlug(doctor.country) || countrySlug : countrySlug

  // Parse comma-separated fields into display arrays
  const languages = doctor.languages
    ? doctor.languages.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const certifications = doctor.certifications
    ? doctor.certifications.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const subSpecialties = doctor.subSpecialties
    ? doctor.subSpecialties.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const educationItems = doctor.education
    ? doctor.education.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <Link
            href={`/${locale}/doctors/${countrySlug}`}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <span>←</span>
            <span>Doctors in {countryName}</span>
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
            {doctor.user?.avatarUrl ? (
              <img
                src={doctor.user.avatarUrl}
                alt={name}
                className="size-24 shrink-0 rounded-[20px] object-cover"
              />
            ) : (
              <div className="flex size-24 shrink-0 items-center justify-center rounded-[20px] bg-primary/10 text-3xl font-semibold text-primary">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{name}</h1>
                {doctor.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                      verified
                    </span>
                    Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-base text-muted-foreground">{doctor.specialty}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                  location_on
                </span>
                <span className="me-1">{countryFlag}</span>
                {doctor.city}
                {doctor.city && countryName ? ', ' : ''}
                {countryName}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined fill-warning text-warning" style={{ fontSize: 20 }} aria-hidden>
                    star
                  </span>
                  <span className="text-base font-semibold text-foreground">{doctor.rating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">({doctor.reviewCount} reviews)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-muted-foreground" style={{ fontSize: 20 }} aria-hidden>
                    payments
                  </span>
                  <span className="text-xs text-muted-foreground">From</span>
                  <span className="text-base font-semibold text-foreground">
                    {formatCurrency(doctor.consultationFee, 'USD', locale)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Body grid */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column — main content */}
          <div className="space-y-8 lg:col-span-2">
            {doctor.bio && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">About</h2>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground">{doctor.bio}</p>
              </section>
            )}

            {(educationItems.length > 0 || certifications.length > 0) && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Credentials</h2>
                {educationItems.length > 0 && (
                  <div className="mt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Education</h3>
                    <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                      {educationItems.map((item, idx) => <li key={idx}>• {item}</li>)}
                    </ul>
                  </div>
                )}
                {certifications.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certifications</h3>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {certifications.map((item, idx) => (
                        <span key={idx} className="rounded-full border border-divider px-3 py-1 text-xs text-foreground">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {doctor.services.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Services</h2>
                <div className="mt-3 space-y-3">
                  {doctor.services.map((service) => (
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

            {/* Locations */}
            {doctor.locations.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Locations</h2>
                <div className="mt-3 space-y-3">
                  {doctor.locations.map((loc) => {
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
                  <span className="text-sm text-muted-foreground">In-person consultation</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(doctor.consultationFee, 'USD', locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Online consultation</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(doctor.onlineFee, 'USD', locale)}
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
                <div>
                  <dt className="text-muted-foreground">Specialty</dt>
                  <dd className="font-medium text-foreground">{doctor.specialty}</dd>
                </div>
                {subSpecialties.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Sub-specialties</dt>
                    <dd className="font-medium text-foreground">{subSpecialties.join(', ')}</dd>
                  </div>
                )}
                {doctor.yearsExperience > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Experience</dt>
                    <dd className="font-medium text-foreground">{doctor.yearsExperience} years</dd>
                  </div>
                )}
                {languages.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Languages</dt>
                    <dd className="font-medium text-foreground">{languages.join(', ')}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="rounded-[16px] border border-divider bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explore</h2>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Link
                  href={`/${locale}/doctors/${countrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  More doctors in {countryName}
                </Link>
                <Link
                  href={`/${locale}/doctors`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  All doctors
                </Link>
                <Link
                  href={`/${locale}/hospitals/${detailCountrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  Hospitals in {countryName}
                </Link>
                <Link
                  href={`/${locale}/translators/${detailCountrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  Translators in {countryName}
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
