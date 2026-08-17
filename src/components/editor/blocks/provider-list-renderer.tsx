import Link from 'next/link'
import { db } from '@/lib/db'
import { getCountrySlug, getCountryFlag } from '@/lib/countries'
import { formatCurrency } from '@/lib/money'

type ProviderListRendererProps = {
  providerType: 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
  country?: string
  limit?: number
  layout?: 'grid' | 'list'
  locale?: string
}

export async function ProviderListRenderer({
  providerType, country, limit = 6, layout = 'grid', locale = 'en',
}: ProviderListRendererProps) {
  const where: any = {
    verified: true,
    user: { kycStatus: 'APPROVED' },
    slug: { not: null },
    ...(country ? { country } : {}),
  }
  let providers: any[] = []
  const take = Math.min(Math.max(limit, 1), 24)

  if (providerType === 'DOCTOR') {
    providers = await db.doctor.findMany({
      where, orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }], take,
      select: { id: true, slug: true, specialty: true, city: true, country: true, consultationFee: true, rating: true, reviewCount: true, user: { select: { name: true, avatarUrl: true } } },
    })
  } else if (providerType === 'HOSPITAL') {
    providers = await db.hospital.findMany({
      where, orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }], take,
      select: { id: true, slug: true, name: true, city: true, country: true, baseFee: true, rating: true, reviewCount: true, user: { select: { avatarUrl: true } } },
    })
  } else if (providerType === 'HOTEL') {
    providers = await db.hotel.findMany({
      where, orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }], take,
      select: { id: true, slug: true, name: true, city: true, country: true, pricePerNight: true, starRating: true, rating: true, reviewCount: true, user: { select: { avatarUrl: true } } },
    })
  } else if (providerType === 'TRANSLATOR') {
    providers = await db.translator.findMany({
      where, orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }], take,
      select: { id: true, slug: true, specialization: true, city: true, country: true, hourlyRate: true, rating: true, reviewCount: true, spokenLanguages: true, user: { select: { name: true, avatarUrl: true } } },
    })
  }

  if (providers.length === 0) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-center"><p className="text-sm text-muted-foreground">No {providerType.toLowerCase()}s available.</p></div>
  }

  const typeSlug = `${providerType.toLowerCase()}s`
  const gridCls = layout === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-3'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className={gridCls}>
        {providers.map((p) => {
          const name = p.user?.name || p.name || 'Unknown'
          const countrySlug = p.country ? getCountrySlug(p.country) : null
          const detailHref = countrySlug && p.slug ? `/${locale}/${typeSlug}/${countrySlug}/${p.slug}` : `/${locale}/${typeSlug}`
          const flag = p.country ? getCountryFlag(p.country) : '🌍'
          const subtitle = p.specialty || p.specialization || 'Provider'
          const priceLabel = providerType === 'DOCTOR' ? `From ${formatCurrency(p.consultationFee, 'USD', locale)}`
            : providerType === 'HOSPITAL' ? `From ${formatCurrency(p.baseFee, 'USD', locale)}`
            : providerType === 'HOTEL' ? `From ${formatCurrency(p.pricePerNight, 'USD', locale)} / night`
            : `From ${formatCurrency(p.hourlyRate, 'USD', locale)} / hour`
          return (
            <Link key={p.id} href={detailHref} className="group flex flex-col gap-0 overflow-hidden rounded-[16px] border border-divider bg-surface transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><span>{flag}</span><span className="truncate">{p.city || ''}{p.city && p.country ? ', ' : ''}{p.country || ''}</span></p>
                  </div>
                </div>
              </div>
              <div className="border-t border-divider p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">⭐ {p.rating?.toFixed(1) || '0.0'} ({p.reviewCount || 0})</span>
                  <span className="text-xs font-semibold text-foreground">{priceLabel}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
