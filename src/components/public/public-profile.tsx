'use client'
import { useRouter } from 'next/navigation'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { StarRating } from '@/components/shared/star-rating'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { BookNowButton } from '@/components/shared/book-now-button'
import { useT } from '@/hooks/use-t'
import { useApi } from '@/hooks/use-api'
import { formatCurrency, relativeTime } from '@/lib/money'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const TYPE_ICON: Record<string, string> = {
  DOCTOR: 'medical_services',
  HOSPITAL: 'local_hospital',
  HOTEL: 'hotel',
  TRANSLATOR: 'translate',
}

const TYPE_LABEL_KEY: Record<string, string> = {
  DOCTOR: 'role.doctor',
  HOSPITAL: 'role.hospital',
  HOTEL: 'role.hotel',
  TRANSLATOR: 'role.translator',
}

export function PublicProfilePage() {
  const router = useRouter()
  const view = useApp((s) => s.view)
  const goLanding = useApp((s) => s.goLanding)
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const { t, dir } = useT()

  const providerId = view.name === 'public-profile' ? view.providerId : ''
  const providerType = view.name === 'public-profile' ? view.providerType : 'DOCTOR'

  const url = providerId ? `/api/providers/public?id=${providerId}&type=${providerType}` : null
  const { data, loading, error } = useApi<{ profile: any }>(url)

  const profile = data?.profile

  return (
    <div className="flex min-h-screen flex-col bg-background" dir={dir}>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-divider bg-surface/80 px-4 backdrop-blur-md md:px-8">
        <button onClick={goLanding} className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <Icon name="monitor_heart" size={22} fill />
          </div>
          <span className="text-lg font-semibold">{t('brand.name')}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost"><Icon name="translate" size={20} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {LOCALES.map((l) => (
                <DropdownMenuItem key={l} onClick={() => setLocale(l as Locale)} className={cn(locale === l && 'bg-accent')}>
                  <span className="text-base">{LOCALE_META[l].flag}</span> {LOCALE_META[l].native}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => router.push(`/${locale}`)}>{t('common.signin')}</Button>
          <Button size="sm" variant="outline" onClick={() => router.push(`/${locale}`)}>{t('common.signup')}</Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">
        {loading ? (
          <PublicProfileSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-[20px] bg-error/10 text-error">
              <Icon name="error" size={32} />
            </div>
            <h2 className="text-xl font-semibold">{t('common.error')}</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={goLanding} className="mt-2">{t('common.back')}</Button>
          </div>
        ) : !profile ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-[20px] bg-surface-secondary text-muted-foreground">
              <Icon name="person_off" size={32} />
            </div>
            <h2 className="text-xl font-semibold">{t('common.noResults')}</h2>
            <Button onClick={goLanding} className="mt-2">{t('common.back')}</Button>
          </div>
        ) : (
          <div className="animate-fade-in space-y-6">
            <button onClick={goLanding} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <Icon name="arrow_back" size={16} className="rtl:rotate-180" />
              {t('common.back')}
            </button>

            <Card className="gap-0 overflow-hidden">
              <CardContent className="p-0">
                <div className="h-24 bg-primary/10" />
                <div className="px-6 pb-6">
                  <div className="-mt-12 flex items-end gap-4">
                    <div className="flex size-24 shrink-0 items-center justify-center rounded-[20px] border-4 border-surface bg-primary/10 text-3xl font-bold text-primary shadow-sm">
                      {(profile.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-foreground">{profile.name}</h1>
                        {profile.verified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <Icon name="verified" size={14} fill />
                            {t('common.verified')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Icon name={TYPE_ICON[profile.type] || 'person'} size={16} fill />
                          {t(TYPE_LABEL_KEY[profile.type] || 'role.patient')}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Icon name="location_on" size={16} />
                          {profile.address}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <StarRating rating={profile.rating || 0} size={18} showValue />
                      <span className="text-sm text-muted-foreground">({profile.reviewCount} {t('common.reviews')})</span>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="flex items-center gap-2">
                      <Icon name="payments" size={18} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t('common.from')}</span>
                      <span className="text-lg font-semibold text-foreground">{formatCurrency(profile.consultationFee, 'USD', locale)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {profile.bio && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon name="description" size={18} className="text-primary" />
                        {t('browse.bio')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-pretty text-sm leading-relaxed text-foreground">{profile.bio}</p>
                    </CardContent>
                  </Card>
                )}

                {profile.services && profile.services.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon name="medical_services" size={18} className="text-primary" />
                        {t('dash.services')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {profile.services.map((s: any) => (
                        <div key={s.id} className="flex items-start justify-between gap-3 rounded-[14px] border border-divider bg-surface-secondary/50 p-4 transition-colors hover:bg-surface-secondary">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{s.name}</p>
                            {s.description && <p className="mt-0.5 text-sm text-muted-foreground">{s.description}</p>}
                            {s.durationMinutes && (
                              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Icon name="schedule" size={12} />
                                {s.durationMinutes} {t('common.minutes')}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 font-semibold text-foreground tabular-nums">{formatCurrency(s.price, 'USD', locale)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon name="reviews" size={18} className="text-primary" />
                      {t('common.reviews')}
                      {profile.reviewCount > 0 && <span className="text-sm font-normal text-muted-foreground">({profile.reviewCount})</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {profile.reviews && profile.reviews.length > 0 ? (
                      <div className="space-y-4">
                        {profile.reviews.map((r: any) => (
                          <div key={r.id} className="rounded-[14px] border border-divider p-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {(r.authorName || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground">{r.authorName || 'Anonymous'}</p>
                                <div className="flex items-center gap-2">
                                  <StarRating rating={r.rating} size={12} />
                                  <span className="text-xs text-muted-foreground">{relativeTime(r.createdAt, locale)}</span>
                                </div>
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-foreground">{r.comment}</p>
                            {r.reply && (
                              <div className="mt-3 rounded-[12px] border-s-2 border-primary bg-accent/20 p-3">
                                <div className="flex items-center gap-1.5">
                                  <Icon name="reply" size={12} className="text-primary" />
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{t('review.replyTitle')}</span>
                                </div>
                                <p className="mt-1 text-sm text-foreground">{r.reply}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <Icon name="reviews" size={28} className="text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{t('provider.noReviews')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="sticky top-20 gap-0">
                  <CardContent className="space-y-4 p-5">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('common.from')}</p>
                      <p className="text-3xl font-bold text-foreground">{formatCurrency(profile.consultationFee, 'USD', locale)}</p>
                    </div>
                    <BookNowButton locale={locale} providerId={providerId} providerType={providerType} variant="public-profile" />
                    <Button size="lg" variant="outline" className="w-full gap-2" onClick={() => router.push(`/${locale}`)}>
                      {t('common.signin')}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">{t('landing.feature.secure.desc')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('provider.profileSection')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {profile.specialty && <InfoRow icon="badge" label={t('common.specialty')} value={profile.specialty} />}
                    {profile.subSpecialties && <InfoRow icon="category" label={t('provider.subSpecialties')} value={profile.subSpecialties} />}
                    {profile.languages && <InfoRow icon="language" label={t('common.languages')} value={profile.languages} />}
                    {profile.yearsExperience > 0 && <InfoRow icon="work_history" label={t('common.experience')} value={`${profile.yearsExperience} ${t('common.years')}`} />}
                    {profile.education && <InfoRow icon="school" label={t('provider.education')} value={profile.education} />}
                    {profile.certifications && <InfoRow icon="workspace_premium" label={t('provider.certifications')} value={profile.certifications} />}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-auto border-t border-divider bg-surface px-6 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {t('brand.name')}. {t('footer.rights')}
      </footer>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-secondary text-muted-foreground">
        <Icon name={icon} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}

function PublicProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-20" />
      <Card className="gap-0 overflow-hidden">
        <Skeleton className="h-24 w-full rounded-none" />
        <CardContent className="p-6">
          <div className="-mt-12 flex items-end gap-4">
            <Skeleton className="size-24 rounded-[20px] border-4 border-surface" />
            <div className="flex-1 space-y-2 pb-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="mt-4 flex gap-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-28" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card><CardContent className="space-y-3 p-6"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></CardContent></Card>
        </div>
        <div className="space-y-6">
          <Card><CardContent className="space-y-3 p-5"><Skeleton className="h-8 w-24" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
        </div>
      </div>
    </div>
  )
}
