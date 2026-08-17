import Link from 'next/link'
import { db } from '@/lib/db'
import { getCountrySlug, getCountryFlag } from '@/lib/countries'
import { formatCurrency } from '@/lib/money'

type FeaturedDoctorsSSRProps = {
  title?: string
  limit?: number
  locale?: string
}

export async function FeaturedDoctorsSSR({
  title = 'Top Doctors', limit = 4, locale = 'en',
}: FeaturedDoctorsSSRProps) {
  const take = Math.min(Math.max(limit, 1), 8)
  const doctors = await db.doctor.findMany({
    where: { verified: true, user: { kycStatus: 'APPROVED' }, slug: { not: null } },
    orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }], take,
    select: { id: true, slug: true, specialty: true, city: true, country: true, consultationFee: true, rating: true, reviewCount: true, user: { select: { name: true, avatarUrl: true } } },
  })

  if (doctors.length === 0) {
    return <section className="mx-auto max-w-6xl px-4 py-12 text-center"><h2 className="mb-4 text-3xl font-bold text-foreground">{title}</h2><p className="text-sm text-muted-foreground">No verified doctors available yet.</p></section>
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="mb-8 text-center text-3xl font-bold text-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {doctors.map((doc) => {
          const name = doc.user?.name || 'Doctor'
          const countrySlug = doc.country ? getCountrySlug(doc.country) : null
          const href = countrySlug && doc.slug ? `/${locale}/doctors/${countrySlug}/${doc.slug}` : `/${locale}/doctors`
          const flag = doc.country ? getCountryFlag(doc.country) : '🌍'
          return (
            <Link key={doc.id} href={href} className="group flex flex-col gap-0 overflow-hidden rounded-[16px] border border-divider bg-surface transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{doc.specialty}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><span>{flag}</span><span className="truncate">{doc.city || ''}</span></p>
                  </div>
                </div>
              </div>
              <div className="border-t border-divider p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">⭐ {doc.rating?.toFixed(1) || '0.0'} ({doc.reviewCount || 0})</span>
                  <span className="text-xs font-semibold text-foreground">From {formatCurrency(doc.consultationFee, 'USD', locale)}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
