import { db } from '@/lib/db'
import Link from 'next/link'
import { BookNowButton } from '@/components/shared/book-now-button'
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

type HotelDetail = {
  id: string
  slug: string | null
  name: string
  description: string
  address: string
  city: string
  country: string
  starRating: number
  amenities: string
  roomTypes: string
  pricePerNight: string
  languages: string
  verified: boolean
  rating: number
  reviewCount: number
  services: { id: string; name: string; description: string; price: string; currency: string; durationMinutes: number | null }[]
}

/**
 * Fetch a single hotel by slug, including its active services. Only verified
 * hotels whose user has KYC APPROVED status are publicly visible.
 *
 * NOTE: Hotels have NO ProviderLocation relation — country filtering relies
 * solely on the hotel's primary `country` field.
 */
async function getHotel(slug: string): Promise<HotelDetail | null> {
  const hotel = await db.hotel.findUnique({
    where: { slug },
    include: {
      user: { select: { kycStatus: true } },
      services: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
      },
    },
  })

  if (!hotel) return null
  if (!hotel.verified) return null
  if (!hotel.slug) return null
  if (hotel.user?.kycStatus !== 'APPROVED') return null

  const { user: _user, ...publicHotel } = hotel
  void _user
  return publicHotel
}

/**
 * Generate SEO metadata for the hotel detail page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; countrySlug: string; providerSlug: string }>
}): Promise<Metadata> {
  const { locale, countrySlug, providerSlug } = await params
  const hotel = await getHotel(providerSlug)
  if (!hotel) {
    return { title: 'Hotel not found — Wishubest' }
  }

  const countryCode = getCountryCode(countrySlug)
  const countryName = countryCode ? getCountryName(countrySlug.toLowerCase()) || countryCode : countrySlug
  const url = `/${locale}/hotels/${countrySlug}/${hotel.slug}`
  const metaTitle = `${hotel.name} — ${hotel.starRating}-star Hotel in ${countryName}`
  const metaDescription =
    hotel.description?.slice(0, 160) ||
    `${hotel.name} is a verified ${hotel.starRating}-star hotel in ${hotel.city}, ${countryName}. Book your medical tourism stay on Wishubest.`

  return {
    title: metaTitle,
    description: metaDescription,
    alternates: {
      canonical: url,
      languages: {
        'en': `/en/hotels/${countrySlug}/${hotel.slug}`,
        'tr': `/tr/hotels/${countrySlug}/${hotel.slug}`,
        'fa': `/fa/hotels/${countrySlug}/${hotel.slug}`,
        'ar': `/ar/hotels/${countrySlug}/${hotel.slug}`,
        'ru': `/ru/hotels/${countrySlug}/${hotel.slug}`,
        'x-default': `/en/hotels/${countrySlug}/${hotel.slug}`,
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

export default async function HotelDetailPage({
  params,
}: {
  params: Promise<{ locale: string; countrySlug: string; providerSlug: string }>
}) {
  const { locale, countrySlug, providerSlug } = await params

  const countryCode = getCountryCode(countrySlug)
  if (!countryCode) notFound()

  const hotel = await getHotel(providerSlug)
  if (!hotel) notFound()

  // Hotels have no locations relation — verify the hotel's primary country
  if (hotel.country !== countryCode) notFound()

  const countryName = getCountryName(countrySlug) || countrySlug
  const countryFlag = getCountryFlag(countrySlug)
  const detailCountrySlug = hotel.country ? getCountrySlug(hotel.country) || countrySlug : countrySlug

  const amenities = hotel.amenities
    ? hotel.amenities.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const roomTypes = hotel.roomTypes
    ? hotel.roomTypes.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const languages = hotel.languages
    ? hotel.languages.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <Link
            href={`/${locale}/hotels/${countrySlug}`}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <span>←</span>
            <span>Hotels in {countryName}</span>
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
                hotel
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{hotel.name}</h1>
                {hotel.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                      verified
                    </span>
                    Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-base text-muted-foreground">
                {'★'.repeat(Math.max(1, Math.min(5, hotel.starRating)))} {hotel.starRating}-star hotel
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                  location_on
                </span>
                <span className="me-1">{countryFlag}</span>
                {hotel.city}
                {hotel.city && countryName ? ', ' : ''}
                {countryName}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined fill-warning text-warning" style={{ fontSize: 20 }} aria-hidden>
                    star
                  </span>
                  <span className="text-base font-semibold text-foreground">{hotel.rating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">({hotel.reviewCount} reviews)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-muted-foreground" style={{ fontSize: 20 }} aria-hidden>
                    payments
                  </span>
                  <span className="text-xs text-muted-foreground">From</span>
                  <span className="text-base font-semibold text-foreground">
                    {formatCurrency(hotel.pricePerNight, 'USD', locale)}
                  </span>
                  <span className="text-xs text-muted-foreground">/ night</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Body grid */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column — main content */}
          <div className="space-y-8 lg:col-span-2">
            {hotel.description && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">About</h2>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground">{hotel.description}</p>
              </section>
            )}

            {amenities.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Amenities</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {amenities.map((item, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full border border-divider px-3 py-1 text-xs text-foreground">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: 12 }} aria-hidden>
                        check
                      </span>
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {roomTypes.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Room types</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {roomTypes.map((item, idx) => (
                    <span key={idx} className="rounded-full border border-divider px-3 py-1 text-xs text-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {hotel.services.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-foreground">Services</h2>
                <div className="mt-3 space-y-3">
                  {hotel.services.map((service) => (
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
          </div>

          {/* Right column — quick facts sidebar */}
          <aside className="space-y-6">
            <div className="rounded-[16px] border border-divider bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking</h2>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Per night</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(hotel.pricePerNight, 'USD', locale)}
                  </span>
                </div>
              </div>
              <BookNowButton locale={locale} providerId={hotel.id} providerType="hotel" />
            </div>

            <div className="rounded-[16px] border border-divider bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick facts</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Star rating</dt>
                  <dd className="font-medium text-foreground">
                    {'★'.repeat(Math.max(1, Math.min(5, hotel.starRating)))} {hotel.starRating} stars
                  </dd>
                </div>
                {languages.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Languages</dt>
                    <dd className="font-medium text-foreground">{languages.join(', ')}</dd>
                  </div>
                )}
                {hotel.address && (
                  <div>
                    <dt className="text-muted-foreground">Address</dt>
                    <dd className="font-medium text-foreground">{hotel.address}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="rounded-[16px] border border-divider bg-surface p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explore</h2>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <Link
                  href={`/${locale}/hotels/${countrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  More hotels in {countryName}
                </Link>
                <Link
                  href={`/${locale}/hotels`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  All hotels
                </Link>
                <Link
                  href={`/${locale}/doctors/${detailCountrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  Doctors in {countryName}
                </Link>
                <Link
                  href={`/${locale}/hospitals/${detailCountrySlug}`}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  Hospitals in {countryName}
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
