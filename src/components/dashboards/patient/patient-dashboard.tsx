'use client'

import * as React from 'react'
import { useMemo, useState, useEffect, useRef } from 'react'
import { Icon } from '@/components/shared/icon'
import { StarRating } from '@/components/shared/star-rating'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost, apiPut, apiPatch, apiDelete } from '@/hooks/use-api'
import { useApp } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  formatCurrency, formatDate, formatDateTime, relativeTime, mulDec,
} from '@/lib/money'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { downloadICal } from '@/lib/ical'
import { TicketsSection } from '@/components/shared/tickets-section'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { MessagesSection } from '@/components/chat/messages-section'
import { ItinerariesSection } from '@/components/dashboards/patient/itineraries-list'
import { Progress } from '@/components/ui/progress'
import { ManageAccessDialog, type MedicalDocument as VaultDocument } from '@/components/dashboards/patient/medical-vault'
import { TripTracker } from '@/components/dashboards/patient/trip-tracker'
import { TriageBot } from '@/components/shared/triage-bot'

/* =========================================================================
 * Types
 * ======================================================================= */

type ProviderType = 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
type VisitType = 'IN_PERSON' | 'ONLINE'
type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'REFUNDED'

interface Provider {
  id: string
  providerType: ProviderType
  userId: string
  name: string | null
  avatarUrl: string | null
  specialty: string
  subSpecialties: string
  bio: string
  city: string
  country: string
  yearsExperience: number
  languages: string
  education: string
  certifications: string
  verified: boolean
  rating: number
  reviewCount: number
  price: string
  onlinePrice: string | null
  priceLabel: string
  address: string
  extra: Record<string, any>
}

interface Slot {
  id: string
  startTime: string
  endTime: string
  visitType: VisitType
  isBooked: boolean
}

interface BookingProvider {
  doctor?: { id: string; user: { name: string | null } } | null
  hospital?: { id: string; name: string; user: { name: string | null } } | null
  hotel?: { id: string; name: string; user: { name: string | null } } | null
  translator?: { id: string; user: { name: string | null } } | null
}

interface Booking extends BookingProvider {
  id: string
  patientId: string
  providerType: ProviderType
  service?: { id: string; name: string; price: string } | null
  slot?: { id: string; startTime: string; endTime: string; visitType: VisitType } | null
  visitType: VisitType
  status: BookingStatus
  startDate: string
  endDate: string | null
  amount: string
  currency: string
  commissionRate: string
  commissionAmount: string
  providerNetAmount: string
  videoSessionUrl: string | null
  notes: string | null
  cancellationReason: string | null
  refundAmount: string | null
  createdAt: string
  payment?: { id: string; amount: string; status: string; refundAmount: string } | null
  review?: { id: string; rating: number; comment: string; createdAt: string; language: string } | null
}

interface PatientStats {
  totalBookings: number
  upcoming: number
  completed: number
  totalSpent: string
  recentBookings: Booking[]
}

interface ProviderDetail {
  provider: any
  reviews: any[]
}

/* =========================================================================
 * Constants & helpers
 * ======================================================================= */

const PROVIDER_TYPE_ICON: Record<ProviderType, string> = {
  DOCTOR: 'medical_services',
  HOSPITAL: 'local_hospital',
  HOTEL: 'hotel',
  TRANSLATOR: 'translate',
}

const PROVIDER_TYPE_LABEL_KEY: Record<ProviderType, string> = {
  DOCTOR: 'role.doctor',
  HOSPITAL: 'role.hospital',
  HOTEL: 'role.hotel',
  TRANSLATOR: 'role.translator',
}

function slotIdParam(type: ProviderType): string {
  if (type === 'DOCTOR') return 'doctorId'
  if (type === 'HOSPITAL') return 'hospitalId'
  return 'translatorId'
}

function providerNameOf(b: Booking): string {
  if (b.doctor) return b.doctor.user.name || ''
  if (b.hospital) return b.hospital.name || b.hospital.user.name || ''
  if (b.hotel) return b.hotel.name || b.hotel.user.name || ''
  if (b.translator) return b.translator.user.name || ''
  return ''
}

function providerNameOfRecent(b: any): string {
  if (b.doctor) return b.doctor.user?.name || ''
  if (b.hospital) return b.hospital.user?.name || ''
  if (b.hotel) return b.hotel.user?.name || ''
  if (b.translator) return b.translator.user?.name || ''
  return ''
}

function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function parseList(s?: string | null): string[] {
  if (!s) return []
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

function statusBadgeClass(status: BookingStatus): string {
  switch (status) {
    case 'CONFIRMED': return 'bg-info/10 text-info border-info/20'
    case 'COMPLETED': return 'bg-success/10 text-success border-success/20'
    case 'CANCELLED':
    case 'REFUNDED': return 'bg-muted text-muted-foreground border-divider'
    case 'PENDING': return 'bg-warning/10 text-warning border-warning/20'
    case 'NO_SHOW': return 'bg-error/10 text-error border-error/20'
    default: return 'bg-muted text-muted-foreground border-divider'
  }
}

function statusLabelKey(status: BookingStatus): string {
  switch (status) {
    case 'CONFIRMED': return 'bookings.confirmed'
    case 'COMPLETED': return 'common.completed'
    case 'CANCELLED': return 'common.cancelled'
    case 'REFUNDED': return 'common.cancelled'
    case 'PENDING': return 'common.pending'
    case 'NO_SHOW': return 'common.noShow'
    default: return 'common.pending'
  }
}

function isHotel(p: Provider): boolean { return p.providerType === 'HOTEL' }

function onlinePriceAvailable(p: Provider): boolean {
  return p.providerType === 'DOCTOR' && !!p.onlinePrice && parseFloat(p.onlinePrice) > 0
}

// Group slots by date label (YYYY-MM-DD)
function groupSlotsByDate(slots: Slot[]): { date: string; items: Slot[] }[] {
  const map = new Map<string, Slot[]>()
  for (const s of slots) {
    const key = new Date(s.startTime).toISOString().slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
}

/* =========================================================================
 * Shared UI primitives
 * ======================================================================= */

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[16px] border border-error/30 bg-error/5 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
        <Icon name="error" size={24} fill />
      </div>
      <p className="text-sm text-foreground">{message || t('common.error')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <Icon name="refresh" size={16} />
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-divider bg-surface px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon name={icon} size={28} fill />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

function StatCard({ icon, label, value, tone }: {
  icon: string
  label: string
  value: string | number
  tone: 'primary' | 'success' | 'warning' | 'error' | 'info'
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
    info: 'bg-info/10 text-info',
  }[tone]
  return (
    <Card className="animate-fade-in gap-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
          </div>
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', toneClass)}>
            <Icon name={icon} size={20} fill />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ProviderAvatar({ name, avatarUrl, size = 48 }: { name: string | null; avatarUrl: string | null; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary"
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold" style={{ fontSize: size * 0.32 }}>{initials(name)}</span>
      )}
    </div>
  )
}

function LanguageBadges({ languages, max = 3 }: { languages: string; max?: number }) {
  const list = parseList(languages).slice(0, max)
  if (list.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((l, i) => (
        <span
          key={`item-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <Icon name="language" size={11} />
          {l}
        </span>
      ))}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/* =========================================================================
 * Section: Overview
 * ======================================================================= */

function OverviewSection() {
  const { t, locale } = useT()
  const session = useApp((s) => s.session)
  const goDashboard = useApp((s) => s.goDashboard)
  const { data, loading, error, refetch } = useApi<PatientStats>('/api/stats')

  if (loading) return <OverviewSkeleton />
  if (error || !data) return <ErrorState message={error || undefined} onRetry={refetch} />

  const stats = [
    { icon: 'event', label: t('stat.totalBookings'), value: String(data.totalBookings ?? 0), tone: 'primary' as const },
    { icon: 'schedule', label: t('stat.upcoming'), value: String(data.upcoming ?? 0), tone: 'warning' as const },
    { icon: 'check_circle', label: t('stat.completedVisits'), value: String(data.completed ?? 0), tone: 'success' as const },
    { icon: 'payments', label: t('stat.revenue'), value: formatCurrency(data.totalSpent || '0', 'USD', locale), tone: 'info' as const },
  ]

  const quickActions = [
    { icon: 'travel_explore', label: t('quick.browse'), tone: 'bg-primary/10 text-primary', section: 'browse' as const },
    { icon: 'compare', label: t('quick.compare'), tone: 'bg-success/10 text-success', section: 'compare' as const },
    { icon: 'event', label: t('quick.bookings'), tone: 'bg-warning/10 text-warning', section: 'bookings' as const },
    { icon: 'reviews', label: t('dash.reviews'), tone: 'bg-info/10 text-info', section: 'reviews' as const },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('overview.welcome')}, {session?.name?.split(' ')[0] || ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('dash.overview')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} tone={s.tone} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent bookings */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="event" size={18} className="text-primary" fill />
              {t('overview.recentBookings')}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => goDashboard('bookings')} className="gap-1.5 text-primary">
              {t('common.viewAll')}
              <Icon name="chevron_right" size={16} className="rtl:rotate-180" />
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentBookings && data.recentBookings.length > 0 ? (
              <ul className="flex flex-col divide-y divide-divider">
                {data.recentBookings.slice(0, 6).map((b) => {
                  const name = providerNameOfRecent(b)
                  return (
                    <li key={b.id}>
                      <button
                        onClick={() => goDashboard('bookings')}
                        className="flex w-full items-center gap-3 py-3 text-start transition-colors first:pt-0 last:pb-0 hover:opacity-80"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon name={PROVIDER_TYPE_ICON[b.providerType as ProviderType]} size={20} fill />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{name || '—'}</span>
                            <Icon
                              name={b.visitType === 'ONLINE' ? 'videocam' : 'person'}
                              size={13}
                              className="text-muted-foreground"
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(b.startDate, locale)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={cn('rounded-full border', statusBadgeClass(b.status))}>
                            {t(statusLabelKey(b.status))}
                          </Badge>
                          <span className="text-sm font-medium text-foreground tabular-nums">
                            {formatCurrency(b.amount, 'USD', locale)}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-secondary text-muted-foreground">
                  <Icon name="event_busy" size={24} fill />
                </div>
                <p className="text-sm text-muted-foreground">{t('overview.noRecent')}</p>
                <Button size="sm" onClick={() => goDashboard('browse')}>
                  <Icon name="travel_explore" size={16} />
                  {t('quick.browse')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="bolt" size={18} className="text-warning" fill />
              {t('overview.quickActions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((a) => (
                <button
                  key={a.section}
                  onClick={() => goDashboard(a.section)}
                  className="flex flex-col items-start gap-3 rounded-2xl border border-divider bg-surface p-4 text-start transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className={cn('flex size-10 items-center justify-center rounded-xl', a.tone)}>
                    <Icon name={a.icon} size={22} fill />
                  </div>
                  <span className="text-sm font-medium text-foreground">{a.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Symptom Checker */}
      <TriageBot />
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`item-${i}`} className="gap-0">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-20" />
                </div>
                <Skeleton className="size-10 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`item-${i}`} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`item-${i}`} className="h-24 rounded-2xl" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* =========================================================================
 * Section: Browse — provider card, detail dialog, booking dialog
 * ======================================================================= */

function BrowseSection() {
  const { t } = useT()
  const [type, setType] = useState<'all' | ProviderType>('all')
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [city, setCity] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<'rating' | 'priceLow' | 'priceHigh' | 'reviews'>('rating')
  const [tick, setTick] = useState(0)

  const [viewProvider, setViewProvider] = useState<Provider | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [bookProvider, setBookProvider] = useState<Provider | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [bookKey, setBookKey] = useState(0)

  // Debounce search input
  React.useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 350)
    return () => clearTimeout(id)
  }, [q])

  const params = new URLSearchParams()
  params.set('type', type)
  if (qDebounced) params.set('q', qDebounced)
  if (city) params.set('city', city)
  if (maxPrice) params.set('maxPrice', maxPrice)
  params.set('sort', sort)
  const url = `/api/providers?${params.toString()}`

  const { data, loading, error, refetch } = useApi<{ results: Provider[]; count: number }>(url, { deps: [url, tick] })

  function openView(p: Provider) {
    setViewProvider(p)
    setViewOpen(true)
  }

  function openBooking(p: Provider) {
    setViewOpen(false)
    setBookProvider(p)
    setBookKey((k) => k + 1)
    setBookOpen(true)
  }

  const typeTabs: { key: 'all' | ProviderType; label: string; icon: string }[] = [
    { key: 'all', label: t('browse.allTypes'), icon: 'apps' },
    { key: 'DOCTOR', label: t('role.doctor'), icon: 'medical_services' },
    { key: 'HOSPITAL', label: t('role.hospital'), icon: 'local_hospital' },
    { key: 'HOTEL', label: t('role.hotel'), icon: 'hotel' },
    { key: 'TRANSLATOR', label: t('role.translator'), icon: 'translate' },
  ]

  function clearFilters() {
    setQ('')
    setCity('')
    setMaxPrice('')
    setSort('rating')
  }

  const hasFilters = q || city || maxPrice || sort !== 'rating'

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('browse.title')} />

      {/* Filter bar */}
      <Card className="gap-0">
        <CardContent className="space-y-4 p-4">
          {/* Type tabs */}
          <div className="flex flex-wrap gap-1.5">
            {typeTabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setType(tb.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  type === tb.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-secondary text-muted-foreground hover:bg-border/40 hover:text-foreground',
                )}
              >
                <Icon name={tb.icon} size={14} fill />
                {tb.label}
              </button>
            ))}
          </div>

          {/* Search + filters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Icon name="search" size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('browse.searchPlaceholder')}
                className="ps-10"
              />
            </div>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t('browse.cityPlaceholder')}
            />
            <Input
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={t('browse.maxPrice')}
              inputMode="decimal"
            />
          </div>

          {/* Sort row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon name="sort" size={16} className="text-muted-foreground" />
              <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                <SelectTrigger className="h-9 w-[180px] rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rating">{t('browse.sortRating')}</SelectItem>
                  <SelectItem value="priceLow">{t('browse.sortPriceLow')}</SelectItem>
                  <SelectItem value="priceHigh">{t('browse.sortPriceHigh')}</SelectItem>
                  <SelectItem value="reviews">{t('browse.sortReviews')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {data && (
                <span className="text-xs text-muted-foreground">
                  {t('browse.results').replace('{count}', String(data.count))}
                </span>
              )}
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
                  <Icon name="filter_alt_off" size={14} />
                  {t('common.clearAll')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <BrowseSkeleton />
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          icon="travel_explore"
          title={t('common.noResults')}
          description={t('browse.noResults')}
          action={hasFilters ? (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <Icon name="filter_alt_off" size={14} />
              {t('common.clearAll')}
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.results.map((p) => (
            <ProviderCard key={p.id} provider={p} onBook={() => openBooking(p)} onView={() => openView(p)} />
          ))}
        </div>
      )}

      <ProviderDetailDialog
        provider={viewProvider}
        open={viewOpen}
        onOpenChange={setViewOpen}
        onBook={(p) => openBooking(p)}
      />
      <BookingDialog
        key={bookKey}
        provider={bookProvider}
        open={bookOpen}
        onOpenChange={setBookOpen}
        onBooked={() => { setTick((x) => x + 1); refetch() }}
      />
    </div>
  )
}

function BrowseSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={`item-${i}`} className="gap-0">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 flex-1 rounded-full" />
              <Skeleton className="size-8 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ProviderCard({ provider, onBook, onView }: {
  provider: Provider
  onBook: () => void
  onView: () => void
}) {
  const { t, locale } = useT()
  const compareIds = useApp((s) => s.compareIds)
  const toggleCompare = useApp((s) => s.toggleCompare)
  const inCompare = compareIds.includes(provider.id)
  const compareFull = compareIds.length >= 4 && !inCompare
  const [isFav, setIsFav] = useState(false)

  // Check favorite status
  useEffect(() => {
    let cancelled = false
    fetch('/api/favorites').then(r => r.json()).then(d => {
      if (!cancelled && d.favorites) {
        setIsFav(d.favorites.some((f: any) => f.providerId === provider.id))
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [provider.id])

  function handleCompareClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (compareFull) {
      toast.info(t('browse.compareFull'))
      return
    }
    toggleCompare(provider.id)
    toast.success(inCompare ? t('browse.removedFromCompare') : t('browse.addedToCompare'))
  }

  async function handleFavoriteClick(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const res = await apiPost('/api/favorites', { providerId: provider.id, providerType: provider.providerType, providerUserId: provider.userId })
      setIsFav(res.favorited)
      toast.success(res.favorited ? t('favorites.added') : t('favorites.removed'))
    } catch (err: any) { toast.error(err.message) }
  }

  const price = formatCurrency(provider.price, 'USD', locale)
  const showOnline = onlinePriceAvailable(provider)

  return (
    <Card
      className="group flex cursor-pointer flex-col gap-0 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"
      onClick={onView}
    >
      {/* === Top Section: Avatar + Name + Specialty + Location === */}
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <ProviderAvatar name={provider.name} avatarUrl={provider.avatarUrl} size={56} />

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold text-foreground">{provider.name || '—'}</h3>
              {provider.verified && (
                <span className="inline-flex shrink-0 text-primary" title={t('common.verified')}>
                  <Icon name="verified" size={14} fill />
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {provider.specialty || t(PROVIDER_TYPE_LABEL_KEY[provider.providerType])}
            </p>
            <div className="mt-0.5 flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Icon name="location_on" size={11} />
              <span className="truncate">{[provider.city, provider.country].filter(Boolean).join(', ')}</span>
            </div>
            {/* Compact rating */}
            <div className="mt-1 flex items-center gap-1">
              <Icon name="star" size={12} className="text-warning" fill />
              <span className="text-[11px] font-medium text-foreground">{provider.rating?.toFixed(1) || '0.0'}</span>
              <span className="text-[10px] text-muted-foreground">({provider.reviewCount})</span>
              {showOnline && (
                <span className="ms-1 inline-flex items-center gap-0.5 rounded-full bg-info/10 px-1.5 py-0.5 text-[9px] font-medium text-info">
                  <Icon name="videocam" size={9} />
                  Online
                </span>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="shrink-0 text-end">
            <div className="text-sm font-bold text-foreground tabular-nums">{price}</div>
            <div className="text-[10px] text-muted-foreground">{provider.priceLabel}</div>
          </div>
        </div>
      </CardContent>

      {/* === Horizontal Divider === */}
      <div className="border-t border-divider" />

      {/* === Bottom Section: CTA Buttons === */}
      <CardContent className="flex items-center gap-2 p-3">
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={(e) => { e.stopPropagation(); onView() }}>
          <Icon name="person" size={14} />
          {t('common.viewProfile', 'View Profile')}
        </Button>
        <Button size="sm" className="flex-1 gap-1.5" onClick={(e) => { e.stopPropagation(); onBook() }}>
          <Icon name="event_available" size={14} />
          {t('common.bookNow')}
        </Button>
        {/* Compare + Favorite as compact icon buttons */}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleCompareClick}
          title={t('common.compare')}
          aria-label={t('common.compare')}
          className={cn('shrink-0', inCompare && 'text-primary')}
        >
          <Icon name="compare" size={16} fill={inCompare} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleFavoriteClick}
          title={t('dash.favorites')}
          aria-label={t('dash.favorites')}
          className={cn('shrink-0', isFav && 'text-error')}
        >
          <Icon name={isFav ? 'favorite' : 'favorite_border'} size={16} fill={isFav} />
        </Button>
      </CardContent>
    </Card>
  )
}

function ProviderDetailDialog({ provider, open, onOpenChange, onBook }: {
  provider: Provider | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onBook: (p: Provider) => void
}) {
  const { t, locale } = useT()
  const url = provider ? `/api/providers/detail?id=${provider.id}&type=${provider.providerType}` : null
  const { data, loading } = useApi<ProviderDetail>(url, { deps: [provider?.id] })

  if (!provider) return null

  async function shareProfile() {
    if (!provider) return
    const shareUrl = `${window.location.origin}/?profile=${provider.providerType}:${provider.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t('public.profileCopied'))
    } catch {
      window.open(shareUrl, '_blank')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <ProviderAvatar name={provider.name} avatarUrl={provider.avatarUrl} size={64} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <span className="truncate">{provider.name}</span>
                {provider.verified && <Icon name="verified" size={18} fill className="text-primary" />}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {provider.specialty} · {[provider.city, provider.country].filter(Boolean).join(', ')}
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={shareProfile} title={t('public.shareProfile')}>
              <Icon name="share" size={16} />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4">
            <StarRating rating={provider.rating || 0} size={16} showValue count={provider.reviewCount} />
            <div className="h-4 w-px bg-divider" />
            <div className="text-sm">
              <span className="text-muted-foreground">{t('common.price')}: </span>
              <span className="font-semibold text-foreground">{formatCurrency(provider.price, 'USD', locale)}</span>
              <span className="text-muted-foreground"> · {provider.priceLabel}</span>
            </div>
            {provider.yearsExperience > 0 && !isHotel(provider) && (
              <>
                <div className="h-4 w-px bg-divider" />
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('compare.experience')}: </span>
                  <span className="font-medium text-foreground">{provider.yearsExperience} {t('common.years')}</span>
                </div>
              </>
            )}
          </div>

          {/* Bio */}
          {provider.bio && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">{t('browse.bio')}</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">{provider.bio}</p>
            </div>
          )}

          {/* Languages */}
          {parseList(provider.languages).length > 0 && (
            <div>
              <h4 className="mb-1.5 text-sm font-semibold text-foreground">{t('common.languages')}</h4>
              <LanguageBadges languages={provider.languages} max={20} />
            </div>
          )}

          {/* Sub-specialties */}
          {provider.subSpecialties && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">{t('common.specialty')}</h4>
              <p className="text-sm text-muted-foreground">{provider.subSpecialties}</p>
            </div>
          )}

          {/* Education */}
          {provider.education && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">{t('browse.education')}</h4>
              <p className="text-sm text-muted-foreground">{provider.education}</p>
            </div>
          )}

          {/* Certifications */}
          {provider.certifications && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">{t('browse.certifications')}</h4>
              <p className="text-sm text-muted-foreground">{provider.certifications}</p>
            </div>
          )}

          {/* Services */}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : data?.provider?.services && data.provider.services.length > 0 ? (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">{t('browse.services')}</h4>
              <div className="space-y-2">
                {data.provider.services.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-divider p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                      {s.description && <p className="truncate text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {formatCurrency(s.price, s.currency || 'USD', locale)}
                      </p>
                      {s.durationMinutes && (
                        <p className="text-xs text-muted-foreground">{s.durationMinutes} {t('common.minutes')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Reviews */}
          {data?.reviews && data.reviews.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">{t('common.reviews')}</h4>
              <div className="space-y-2">
                {data.reviews.slice(0, 5).map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-divider p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ProviderAvatar name={r.author?.name} avatarUrl={r.author?.avatarUrl} size={28} />
                        <span className="text-sm font-medium text-foreground">{r.author?.name || '—'}</span>
                      </div>
                      <StarRating rating={r.rating} size={12} />
                    </div>
                    {r.comment && (
                      <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button onClick={() => onBook(provider)}>
            <Icon name="event_available" size={16} />
            {t('common.bookNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BookingDialog({ provider, open, onOpenChange, onBooked }: {
  provider: Provider | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onBooked: () => void
}) {
  const { t, locale } = useT()

  // State — reset by parent via `key` prop
  const [step, setStep] = useState<1 | 2>(1)
  const [visitType, setVisitType] = useState<VisitType>('IN_PERSON')
  const [slotId, setSlotId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [nights, setNights] = useState(1)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Promo code state
  const [promoInput, setPromoInput] = useState('')
  const [promoResult, setPromoResult] = useState<{ valid: boolean; code: string; discountAmount: string; newTotal: string; message?: string; capped?: boolean } | null>(null)
  const [promoApplying, setPromoApplying] = useState(false)

  const hotel = provider ? isHotel(provider) : false
  const showOnline = provider ? onlinePriceAvailable(provider) : false

  // Fetch slots for non-hotel providers
  const slotsUrl = provider && !hotel
    ? `/api/providers/slots?${slotIdParam(provider.providerType)}=${provider.id}`
    : null
  const { data: slotsData, loading: slotsLoading } = useApi<{ slots: Slot[] }>(slotsUrl, { deps: [provider?.id] })

  if (!provider) return null

  const slots = (slotsData?.slots || []).filter((s) => !s.isBooked)
  const grouped = groupSlotsByDate(slots)

  // Determine price + total
  const unitPrice = visitType === 'ONLINE' && provider.onlinePrice ? provider.onlinePrice : provider.price
  const total = hotel ? mulDec(unitPrice, String(nights)) : unitPrice

  const canContinue = hotel
    ? !!startDate && nights > 0
    : !!slotId

  function reset() {
    setStep(1)
    setVisitType('IN_PERSON')
    setSlotId(null)
    setStartDate('')
    setNights(1)
    setNotes('')
    setSubmitting(false)
    setPromoInput('')
    setPromoResult(null)
    setPromoApplying(false)
  }

  // The effective total the patient pays (with promo discount applied if valid).
  const effectiveTotal = promoResult?.valid ? promoResult.newTotal : total

  async function handleApplyPromo() {
    if (!promoInput.trim() || !provider) return
    setPromoApplying(true)
    setPromoResult(null)
    try {
      const res = await apiPost<{ valid: boolean; code?: string; discountAmount?: string; newTotal?: string; message?: string; capped?: boolean }>('/api/promo/validate', {
        code: promoInput.trim(),
        bookingAmount: parseFloat(total),
        providerType: provider.providerType,
      })
      if (res.valid && res.code && res.discountAmount && res.newTotal) {
        setPromoResult({ valid: true, code: res.code, discountAmount: res.discountAmount, newTotal: res.newTotal, capped: res.capped })
        toast.success(t('promo.applied'))
      } else {
        setPromoResult({ valid: false, code: '', discountAmount: '0', newTotal: total, message: res.message || t('promo.invalid') })
        toast.error(res.message || t('promo.invalid'))
      }
    } catch (e: any) {
      setPromoResult({ valid: false, code: '', discountAmount: '0', newTotal: total, message: e.message || t('promo.invalid') })
      toast.error(e.message || t('promo.invalid'))
    } finally {
      setPromoApplying(false)
    }
  }

  function handleClose(o: boolean) {
    if (!o) reset()
    onOpenChange(o)
  }

  function handleConfirm() {
    if (!provider) return
    setSubmitting(true)

    let bodyStartDate = startDate
    let bodyEndDate: string | undefined = undefined
    if (!hotel && slotId) {
      const slot = slots.find((s) => s.id === slotId)
      if (slot) bodyStartDate = slot.startTime
    } else if (hotel && startDate) {
      bodyStartDate = new Date(startDate + 'T12:00:00').toISOString()
      const end = new Date(startDate + 'T12:00:00')
      end.setDate(end.getDate() + nights)
      bodyEndDate = end.toISOString()
    }

    apiPost('/api/bookings', {
      providerType: provider.providerType,
      providerId: provider.id,
      slotId: hotel ? undefined : slotId || undefined,
      visitType: hotel ? 'IN_PERSON' : visitType,
      startDate: bodyStartDate,
      endDate: bodyEndDate,
      notes: notes.trim() || undefined,
      promoCode: promoResult?.valid ? promoResult.code : undefined,
    })
      .then(() => {
        toast.success(t('booking.bookingCreated'))
        handleClose(false)
        onBooked()
      })
      .catch((e: any) => toast.error(e.message || t('booking.paymentFailed')))
      .finally(() => setSubmitting(false))
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="event_available" size={20} fill className="text-primary" />
            {t('common.bookNow')}
          </DialogTitle>
          <DialogDescription>
            {provider.name} · {t(PROVIDER_TYPE_LABEL_KEY[provider.providerType])}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            {/* Visit type (not for hotels) */}
            {!hotel && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('booking.visitType')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setVisitType('IN_PERSON'); setSlotId(null) }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors',
                      visitType === 'IN_PERSON'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-divider bg-surface text-muted-foreground hover:bg-surface-secondary',
                    )}
                  >
                    <Icon name="person" size={18} fill />
                    <span className="flex-1 text-start">{t('booking.inPerson')}</span>
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {formatCurrency(provider.price, 'USD', locale)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (showOnline) { setVisitType('ONLINE'); setSlotId(null) } }}
                    disabled={!showOnline}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors disabled:opacity-50',
                      visitType === 'ONLINE'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-divider bg-surface text-muted-foreground hover:bg-surface-secondary',
                    )}
                  >
                    <Icon name="videocam" size={18} fill />
                    <span className="flex-1 text-start">{t('booking.online')}</span>
                    {showOnline && (
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {formatCurrency(provider.onlinePrice!, 'USD', locale)}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Slots for non-hotel, or dates for hotel */}
            {!hotel ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('booking.selectSlot')}</Label>
                {slotsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`item-${i}`} className="h-12 w-full rounded-xl" />)}
                  </div>
                ) : grouped.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-xl bg-surface-secondary p-3 text-sm text-muted-foreground">
                    <Icon name="calendar_today" size={16} />
                    {t('booking.noSlots')}
                  </div>
                ) : (
                  <div className="max-h-64 space-y-3 overflow-y-auto pe-1">
                    {grouped.map((g) => (
                      <div key={g.date}>
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {formatDate(g.date, locale, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {g.items.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setSlotId(s.id)}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                                slotId === s.id
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-divider bg-surface text-foreground hover:bg-surface-secondary',
                              )}
                            >
                              <Icon name="schedule" size={12} />
                              {formatDate(s.startTime, locale, { hour: '2-digit', minute: '2-digit' })}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('booking.selectDate')}>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
                <Field label={t('booking.selectNights')}>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={nights}
                    onChange={(e) => setNights(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </Field>
              </div>
            )}

            {/* Notes */}
            <Field label={`${t('common.notes')} (${t('common.optional')})`}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="…"
              />
            </Field>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canContinue}>
                {t('booking.continueToPayment')}
                <Icon name="arrow_forward" size={16} className="rtl:rotate-180" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="space-y-3 rounded-2xl border border-divider bg-surface-secondary p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon name="receipt_long" size={16} className="text-primary" />
                {t('booking.summary')}
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('common.price')}</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {formatCurrency(unitPrice, 'USD', locale)}
                    {hotel && <span className="ms-1 text-xs text-muted-foreground">× {nights}</span>}
                  </span>
                </div>
                {hotel && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('common.nights')}</span>
                    <span className="font-medium text-foreground">{nights}</span>
                  </div>
                )}
                {/* Promo discount line */}
                {promoResult?.valid && (
                  <div className="flex items-center justify-between text-success">
                    <span className="flex items-center gap-1.5">
                      <Icon name="local_offer" size={14} fill />
                      {t('promo.discountApplied')} ({promoResult.code})
                    </span>
                    <span className="font-medium tabular-nums">−{formatCurrency(promoResult.discountAmount, 'USD', locale)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{t('common.total')}</span>
                  <span className="text-lg font-semibold text-foreground tabular-nums">
                    {formatCurrency(effectiveTotal, 'USD', locale)}
                  </span>
                </div>
              </div>
            </div>

            {/* Promo code input */}
            <div className="space-y-2 rounded-xl border border-divider p-3">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Icon name="local_offer" size={14} className="text-primary" />
                {t('promo.enterCode')}
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="WINTER10"
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoResult(null) }}
                  className="flex-1 uppercase"
                  onKeyDown={(e) => { if (e.key === 'Enter' && promoInput.trim()) { e.preventDefault(); handleApplyPromo() } }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyPromo}
                  disabled={!promoInput.trim() || promoApplying}
                  className="shrink-0 gap-1.5"
                >
                  {promoApplying ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="check" size={14} />}
                  {t('promo.apply')}
                </Button>
              </div>
              {promoResult?.valid && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <Icon name="check_circle" size={14} fill />
                  {t('promo.applied')} — {t('promo.discountApplied')}: {formatCurrency(promoResult.discountAmount, 'USD', locale)}
                  {promoResult.capped && <span className="text-muted-foreground">({t('promo.capped', 'discount capped at platform commission')})</span>}
                </p>
              )}
              {promoResult && !promoResult.valid && (
                <p className="flex items-center gap-1.5 text-xs text-error">
                  <Icon name="cancel" size={14} fill />
                  {promoResult.message || t('promo.invalid')}
                </p>
              )}
            </div>

            {/* Booking recap */}
            <div className="space-y-1.5 rounded-xl border border-divider p-3 text-sm">
              {!hotel && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('booking.visitType')}</span>
                  <span className="font-medium text-foreground">
                    {visitType === 'ONLINE' ? t('booking.online') : t('booking.inPerson')}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('common.date')}</span>
                <span className="font-medium text-foreground">
                  {!hotel && slotId
                    ? formatDateTime(slots.find((s) => s.id === slotId)?.startTime || '', locale)
                    : hotel && startDate
                      ? formatDate(startDate, locale)
                      : '—'}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                <Icon name="arrow_back" size={16} className="rtl:rotate-180" />
                {t('booking.backToDetails')}
              </Button>
              <Button onClick={handleConfirm} disabled={submitting}>
                {submitting ? (
                  <><Icon name="progress_activity" size={16} className="animate-spin" />{t('common.loading')}</>
                ) : (
                  <><Icon name="payments" size={16} />{t('booking.payNow')}</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Section: Compare
 * ======================================================================= */

function CompareSection() {
  const { t, locale } = useT()
  const compareIds = useApp((s) => s.compareIds)
  const clearCompare = useApp((s) => s.clearCompare)
  const goDashboard = useApp((s) => s.goDashboard)

  const [bookProvider, setBookProvider] = useState<Provider | null>(null)
  const [bookOpen, setBookOpen] = useState(false)
  const [bookKey, setBookKey] = useState(0)
  const [tick, setTick] = useState(0)

  function openBooking(p: Provider) {
    setBookProvider(p)
    setBookKey((k) => k + 1)
    setBookOpen(true)
  }

  const { data, loading, error, refetch } = useApi<{ results: Provider[]; count: number }>(
    '/api/providers?type=all',
    { deps: [tick] },
  )

  const items = useMemo(() => {
    if (!data?.results) return [] as Provider[]
    return compareIds.map((id) => data.results.find((p) => p.id === id)).filter(Boolean) as Provider[]
  }, [data, compareIds])

  if (compareIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title={t('compare.title')} />
        <EmptyState
          icon="compare"
          title={t('compare.emptyTitle')}
          description={t('compare.empty')}
          action={
            <Button onClick={() => goDashboard('browse')}>
              <Icon name="travel_explore" size={16} />
              {t('compare.browseMore')}
            </Button>
          }
        />
      </div>
    )
  }

  const rows: { label: string; icon: string; render: (p: Provider) => React.ReactNode }[] = [
    {
      label: t('compare.price'), icon: 'sell',
      render: (p) => (
        <span className="font-semibold text-foreground tabular-nums">
          {formatCurrency(p.price, 'USD', locale)}
          <span className="ms-1 text-xs font-normal text-muted-foreground">· {p.priceLabel}</span>
        </span>
      ),
    },
    {
      label: t('compare.rating'), icon: 'star',
      render: (p) => <StarRating rating={p.rating || 0} size={14} showValue count={p.reviewCount} />,
    },
    {
      label: t('compare.location'), icon: 'location_on',
      render: (p) => <span className="text-sm text-foreground">{[p.city, p.country].filter(Boolean).join(', ')}</span>,
    },
    {
      label: t('compare.specialty'), icon: 'medical_services',
      render: (p) => <span className="text-sm text-foreground">{p.specialty || '—'}</span>,
    },
    {
      label: t('compare.languages'), icon: 'language',
      render: (p) => <LanguageBadges languages={p.languages} max={4} />,
    },
    {
      label: t('compare.experience'), icon: 'workspace_premium',
      render: (p) => (
        <span className="text-sm text-foreground">
          {p.yearsExperience > 0 ? `${p.yearsExperience} ${t('common.years')}` : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={t('compare.title')}
        subtitle={t('compare.providers')}
        action={
          <Button variant="outline" size="sm" onClick={clearCompare}>
            <Icon name="delete_sweep" size={14} />
            {t('compare.clearAll')}
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: compareIds.length }).map((_, i) => (
            <Skeleton key={`item-${i}`} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <div className="animate-fade-in overflow-x-auto pb-2">
          <div className="min-w-[640px]">
            {/* Header row with provider cards */}
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `140px repeat(${items.length}, minmax(180px, 1fr))` }}
            >
              <div />
              {items.map((p) => (
                <Card key={p.id} className="gap-0">
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-center gap-2">
                      <ProviderAvatar name={p.name} avatarUrl={p.avatarUrl} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                          {p.verified && <Icon name="verified" size={12} fill className="text-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground">{t(PROVIDER_TYPE_LABEL_KEY[p.providerType])}</div>
                      </div>
                      <button
                        onClick={() => useApp.getState().toggleCompare(p.id)}
                        className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
                        aria-label={t('common.cancel')}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                    <Button size="sm" className="w-full" onClick={() => openBooking(p)}>
                      <Icon name="event_available" size={14} />
                      {t('compare.bookNow')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Comparison rows */}
            <div className="mt-3 space-y-2">
              {rows.map((row, ri) => (
                <div
                  key={ri}
                  className="grid items-center gap-3 rounded-xl border border-divider bg-surface p-3"
                  style={{ gridTemplateColumns: `140px repeat(${items.length}, minmax(180px, 1fr))` }}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Icon name={row.icon} size={14} />
                    {row.label}
                  </div>
                  {items.map((p) => (
                    <div key={p.id}>{row.render(p)}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <BookingDialog
        key={bookKey}
        provider={bookProvider}
        open={bookOpen}
        onOpenChange={setBookOpen}
        onBooked={() => { setTick((x) => x + 1) }}
      />
    </div>
  )
}

/* =========================================================================
 * Section: Bookings — list + cancel + review dialogs
 * ======================================================================= */

function BookingsSection() {
  const { t, locale } = useT()
  const [tab, setTab] = useState<'all' | 'pending' | 'upcoming' | 'completed' | 'cancelled'>('all')
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelKey, setCancelKey] = useState(0)
  const [reviewTarget, setReviewTarget] = useState<Booking | null>(null)
  const [reviewKey, setReviewKey] = useState(0)
  const [detailTarget, setDetailTarget] = useState<Booking | null>(null)
  const [detailKey, setDetailKey] = useState(0)
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null)
  const [rescheduleKey, setRescheduleKey] = useState(0)
  const [disputeTarget, setDisputeTarget] = useState<Booking | null>(null)
  const [disputeKey, setDisputeKey] = useState(0)
  const [tick, setTick] = useState(0)

  const statusParam = tab === 'pending' ? 'PENDING' : tab === 'upcoming' ? 'CONFIRMED' : tab === 'completed' ? 'COMPLETED' : tab === 'cancelled' ? 'CANCELLED' : ''
  const url = `/api/bookings${statusParam ? `?status=${statusParam}` : ''}`
  const { data, loading, error, refetch } = useApi<{ bookings: Booking[] }>(url, { deps: [url, tick] })

  function refresh() {
    setTick((x) => x + 1)
    refetch()
  }

  function openCancel(b: Booking) {
    setCancelTarget(b)
    setCancelKey((k) => k + 1)
  }

  function openReview(b: Booking) {
    setReviewTarget(b)
    setReviewKey((k) => k + 1)
  }

  function openDetail(b: Booking) {
    setDetailTarget(b)
    setDetailKey((k) => k + 1)
  }

  function openReschedule(b: Booking) {
    setRescheduleTarget(b)
    setRescheduleKey((k) => k + 1)
  }

  function openDispute(b: Booking) {
    setDisputeTarget(b)
    setDisputeKey((k) => k + 1)
  }

  const tabs: { key: typeof tab; label: string; icon: string }[] = [
    { key: 'all', label: t('bookings.all'), icon: 'list' },
    { key: 'pending', label: t('common.pending'), icon: 'pending' },
    { key: 'upcoming', label: t('bookings.upcoming'), icon: 'event_upcoming' },
    { key: 'completed', label: t('bookings.completed'), icon: 'task_alt' },
    { key: 'cancelled', label: t('bookings.cancelled'), icon: 'cancel' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('dash.bookings')} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-auto flex-wrap">
          {tabs.map((tb) => (
            <TabsTrigger key={tb.key} value={tb.key} className="gap-1.5 rounded-full">
              <Icon name={tb.icon} size={14} />
              {tb.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : loading ? (
            <Card className="gap-0">
              <CardContent className="p-0">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`item-${i}`} className="border-b border-divider p-4 last:border-0">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                      <Skeleton className="h-8 w-20 rounded-full" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : !data || data.bookings.length === 0 ? (
            <EmptyState
              icon="event"
              title={t('common.noResults')}
              description={t('bookings.empty')}
            />
          ) : (
            <Card className="animate-fade-in gap-0">
              <CardContent className="p-0">
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-divider bg-surface-secondary hover:bg-surface-secondary">
                        <TableHead className="ps-4">{t('bookings.provider')}</TableHead>
                        <TableHead>{t('bookings.visitType')}</TableHead>
                        <TableHead>{t('common.date')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        <TableHead className="text-end">{t('common.amount')}</TableHead>
                        <TableHead className="pe-4 text-end">{t('common.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.bookings.map((b) => (
                        <TableRow key={b.id} className="cursor-pointer border-divider transition-colors hover:bg-surface-secondary" onClick={() => openDetail(b)}>
                          <TableCell className="ps-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Icon name={PROVIDER_TYPE_ICON[b.providerType]} size={18} fill />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">{providerNameOf(b) || '—'}</div>
                                <div className="text-xs text-muted-foreground">{t(PROVIDER_TYPE_LABEL_KEY[b.providerType])}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                              <Icon name={b.visitType === 'ONLINE' ? 'videocam' : 'person'} size={14} />
                              {b.visitType === 'ONLINE' ? t('booking.online') : t('booking.inPerson')}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDateTime(b.startDate, locale)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('rounded-full border', statusBadgeClass(b.status))}>
                              {t(statusLabelKey(b.status))}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-end text-sm font-medium text-foreground tabular-nums">
                            {formatCurrency(b.amount, 'USD', locale)}
                          </TableCell>
                          <TableCell className="pe-4 text-end">
                            <BookingActions
                              booking={b}
                              onCancel={() => openCancel(b)}
                              onReview={() => openReview(b)}
                              onReschedule={() => openReschedule(b)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile list */}
                <div className="divide-y divide-divider md:hidden">
                  {data.bookings.map((b) => (
                    <div key={b.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon name={PROVIDER_TYPE_ICON[b.providerType]} size={18} fill />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{providerNameOf(b) || '—'}</span>
                            <Badge variant="outline" className={cn('shrink-0 rounded-full border', statusBadgeClass(b.status))}>
                              {t(statusLabelKey(b.status))}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {t(PROVIDER_TYPE_LABEL_KEY[b.providerType])} · {b.visitType === 'ONLINE' ? t('booking.online') : t('booking.inPerson')}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(b.startDate, locale)}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground tabular-nums">
                              {formatCurrency(b.amount, 'USD', locale)}
                            </span>
                            <BookingActions
                              booking={b}
                              onCancel={() => openCancel(b)}
                              onReview={() => openReview(b)}
                              onReschedule={() => openReschedule(b)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <CancelBookingDialog
        key={`cancel-${cancelKey}`}
        booking={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        onDone={refresh}
      />
      <ReviewDialog
        key={`review-${reviewKey}`}
        booking={reviewTarget}
        open={!!reviewTarget}
        onOpenChange={(o) => !o && setReviewTarget(null)}
        onDone={refresh}
      />
      <BookingDetailDialog
        key={`detail-${detailKey}`}
        booking={detailTarget}
        open={!!detailTarget}
        onOpenChange={(o) => !o && setDetailTarget(null)}
        onOpenDispute={openDispute}
      />
      <RescheduleDialog
        key={`resched-${rescheduleKey}`}
        booking={rescheduleTarget}
        open={!!rescheduleTarget}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
        onDone={refresh}
      />
      <DisputeDialog
        key={`dispute-${disputeKey}`}
        booking={disputeTarget}
        open={!!disputeTarget}
        onOpenChange={(o) => !o && setDisputeTarget(null)}
        onDone={refresh}
      />
    </div>
  )
}

function BookingActions({ booking, onCancel, onReview, onReschedule }: {
  booking: Booking
  onCancel: () => void
  onReview: () => void
  onReschedule: () => void
}) {
  const { t, locale } = useT()

  if (booking.status === 'CONFIRMED') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        {booking.visitType === 'ONLINE' && booking.videoSessionUrl && (
          <Button asChild size="sm" variant="success">
            <a href={booking.videoSessionUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="videocam" size={14} />
              <span className="hidden sm:inline">{t('bookings.joinVideo')}</span>
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onReschedule} title={t('booking.reschedule')}>
          <Icon name="event_repeat" size={14} />
          <span className="hidden lg:inline">{t('booking.reschedule')}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <Icon name="close" size={14} />
          <span className="hidden sm:inline">{t('common.cancel')}</span>
        </Button>
      </div>
    )
  }

  if (booking.status === 'COMPLETED' && !booking.review) {
    return (
      <Button size="sm" variant="outline" onClick={onReview}>
        <Icon name="reviews" size={14} />
        <span className="hidden sm:inline">{t('booking.leaveReview')}</span>
      </Button>
    )
  }

  if (booking.status === 'COMPLETED' && booking.review) {
    return (
      <Badge variant="outline" className="rounded-full border-success/20 bg-success/5 text-success">
        <Icon name="check_circle" size={12} fill />
        {t('common.completed')}
      </Badge>
    )
  }

  if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
    return (
      <span className="text-xs text-muted-foreground">
        {booking.refundAmount && parseFloat(booking.refundAmount) > 0
          ? `${t('bookings.refundAmount')}: ${formatCurrency(booking.refundAmount, 'USD', locale)}`
          : '—'}
      </span>
    )
  }

  return null
}

function CancelBookingDialog({ booking, open, onOpenChange, onDone }: {
  booking: Booking | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const { t, locale } = useT()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ refundAmount: string; feeRetained: string; withinFreeWindow: boolean } | null>(null)

  // State is reset by parent via `key` prop when dialog opens.

  if (!booking) return null

  function handleCancel() {
    if (!booking) return
    setSubmitting(true)
    apiPost('/api/bookings/cancel', { bookingId: booking.id, reason: reason || undefined })
      .then((r: any) => {
        setResult({
          refundAmount: r.refundAmount,
          feeRetained: r.feeRetained,
          withinFreeWindow: r.withinFreeWindow,
        })
        toast.success(t('bookings.cancelSuccess'))
      })
      .catch((e: any) => toast.error(e.message || t('common.error')))
      .finally(() => setSubmitting(false))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o && result) onDone() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="event_cancel" size={20} className="text-error" />
            {t('booking.cancelBooking')}
          </DialogTitle>
          <DialogDescription>
            {providerNameOf(booking)} · {formatDateTime(booking.startDate, locale)}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-success/5 p-4 text-center">
              <Icon name="check_circle" size={32} fill className="mx-auto text-success" />
              <p className="mt-2 text-sm font-medium text-foreground">{t('booking.refundIssued')}</p>
            </div>
            <div className="space-y-2 rounded-xl border border-divider p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('bookings.refundAmount')}</span>
                <span className="font-semibold text-success tabular-nums">
                  {formatCurrency(result.refundAmount, 'USD', locale)}
                </span>
              </div>
              {parseFloat(result.feeRetained) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('bookings.feeRetained')}</span>
                  <span className="font-medium text-error tabular-nums">
                    {formatCurrency(result.feeRetained, 'USD', locale)}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={() => { onOpenChange(false); onDone() }}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl bg-warning/5 p-3 text-xs text-muted-foreground">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning" />
              <span>{t('bookings.cancelWarning')}</span>
            </div>

            <Field label={`${t('booking.cancelReason')} (${t('common.optional')})`}>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={t('common.cancelReasonPlaceholder')}
              />
            </Field>

            <DialogFooter className="flex-row gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={submitting}>
                {t('common.back')}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleCancel} disabled={submitting}>
                {submitting ? (
                  <><Icon name="progress_activity" size={16} className="animate-spin" />{t('common.loading')}</>
                ) : (
                  <><Icon name="event_cancel" size={16} />{t('bookings.cancelConfirm')}</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReviewDialog({ booking, open, onOpenChange, onDone }: {
  booking: Booking | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const { t, locale } = useT()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // State is reset by parent via `key` prop when dialog opens.

  if (!booking) return null

  function handleSubmit() {
    if (!booking) return
    if (comment.trim().length < 3) {
      toast.error(t('bookings.reviewComment'))
      return
    }
    setSubmitting(true)
    apiPost('/api/bookings/review', {
      bookingId: booking.id,
      rating,
      comment: comment.trim(),
      language: locale,
    })
      .then(() => {
        toast.success(t('bookings.reviewSuccess'))
        onOpenChange(false)
        onDone()
      })
      .catch((e: any) => toast.error(e.message || t('common.error')))
      .finally(() => setSubmitting(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="reviews" size={20} fill className="text-primary" />
            {t('booking.leaveReview')}
          </DialogTitle>
          <DialogDescription>{providerNameOf(booking)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={t('bookings.reviewRating')}>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="p-1"
                  aria-label={`${n} stars`}
                >
                  <Icon
                    name="star"
                    size={28}
                    fill={n <= rating}
                    className={n <= rating ? 'text-warning' : 'text-border'}
                  />
                </button>
              ))}
              <span className="ms-2 text-sm font-medium text-foreground">{rating}.0</span>
            </div>
          </Field>

          <Field label={t('bookings.reviewComment')}>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="…"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <><Icon name="progress_activity" size={16} className="animate-spin" />{t('common.loading')}</>
            ) : (
              <><Icon name="send" size={16} />{t('bookings.submitReview')}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Section: Reviews (reviews the patient has written)
 * ======================================================================= */

function ReviewsSection() {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const { data, loading, error, refetch } = useApi<{ bookings: Booking[] }>('/api/bookings')

  const reviewed = useMemo(() => {
    if (!data?.bookings) return [] as Booking[]
    return data.bookings.filter((b) => b.review)
  }, [data])

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={t('reviews.title')}
        subtitle={`${reviewed.length} ${t('common.reviews').toLowerCase()}`}
      />

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`item-${i}`} className="h-40 rounded-2xl" />)}
        </div>
      ) : reviewed.length === 0 ? (
        <EmptyState
          icon="reviews"
          title={t('common.noResults')}
          description={t('reviews.empty')}
          action={
            <Button onClick={() => goDashboard('bookings')}>
              <Icon name="event" size={16} />
              {t('quick.bookings')}
            </Button>
          }
        />
      ) : (
        <div className="grid animate-fade-in grid-cols-1 gap-3 sm:grid-cols-2">
          {reviewed.map((b) => (
            <Card key={b.id} className="gap-0">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon name={PROVIDER_TYPE_ICON[b.providerType]} size={18} fill />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{providerNameOf(b) || '—'}</div>
                      <div className="text-xs text-muted-foreground">{t(PROVIDER_TYPE_LABEL_KEY[b.providerType])}</div>
                    </div>
                  </div>
                  <StarRating rating={b.review!.rating} size={14} showValue />
                </div>
                {b.review!.comment && (
                  <p className="rounded-xl bg-surface-secondary p-3 text-sm text-foreground">{b.review!.comment}</p>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon name="schedule" size={12} />
                  {t('reviews.postedOn')} {formatDate(b.review!.createdAt, locale)}
                  <span className="mx-1">·</span>
                  {relativeTime(b.review!.createdAt, locale)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* =========================================================================
 * Section: Profile
 * ======================================================================= */

function ProfileCompletion({ form, t }: { form: any; t: (k: string, fb?: string) => string }) {
  const fields = [
    { key: 'name', label: t('common.name') },
    { key: 'phone', label: t('common.phone') },
    { key: 'country', label: t('common.country') },
    { key: 'city', label: t('common.city') },
    { key: 'dateOfBirth', label: t('common.dateOfBirth') },
    { key: 'gender', label: t('common.gender') },
    { key: 'bloodGroup', label: t('common.bloodGroup') },
    { key: 'passportNumber', label: t('common.passportNumber') },
    { key: 'emergencyContact', label: t('common.emergencyContact') },
    { key: 'medicalHistory', label: t('common.medicalHistory') },
  ]
  const filled = fields.filter((f) => form[f.key] && String(form[f.key]).trim().length > 0).length
  const pct = Math.round((filled / fields.length) * 100)
  const missing = fields.filter((f) => !form[f.key] || String(form[f.key]).trim().length === 0).map((f) => f.label)

  return (
    <div className="mt-2 w-full space-y-2 text-start">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('profile.completion')}</span>
        <span className="text-xs font-semibold text-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      {pct < 100 && missing.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t('profile.completionDesc')}: {missing.slice(0, 3).join(', ')}{missing.length > 3 ? '…' : ''}
        </p>
      )}
      {pct === 100 && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-success">
          <Icon name="check_circle" size={12} fill />
          {t('common.verified')}
        </p>
      )}
    </div>
  )
}

function ProfileSection() {
  const { t } = useT()
  const { data, loading, error, refetch } = useApi<{ user: any }>('/api/profile')

  if (loading) return <ProfileSkeleton />
  if (error || !data) return <ErrorState message={error || undefined} onRetry={refetch} />

  return <ProfileForm key={data.user.id} user={data.user} onUpdated={refetch} />
}

function ProfileForm({ user, onUpdated }: { user: any; onUpdated?: () => void }) {
  const { t } = useT()
  const [saving, setSaving] = useState(false)
  // useState initializer — runs once per mount (parent uses `key` to remount on user change)
  const [form, setForm] = useState<any>(() => ({
    name: user.name || '',
    phone: user.phone || '',
    country: user.country || '',
    city: user.city || '',
    preferredLanguage: user.preferredLanguage || 'en',
    dateOfBirth: user.patient?.dateOfBirth || '',
    gender: user.patient?.gender || '',
    bloodGroup: user.patient?.bloodGroup || '',
    medicalHistory: user.patient?.medicalHistory || '',
    emergencyContact: user.patient?.emergencyContact || '',
    passportNumber: user.patient?.passportNumber || '',
  }))

  function set<K extends string>(k: K, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }))
  }

  function handleSave() {
    setSaving(true)
    apiPut('/api/profile', form)
      .then(() => toast.success(t('profile.saved')))
      .catch((e: any) => toast.error(e.message || t('common.error')))
      .finally(() => setSaving(false))
  }

  const SaveButton = (
    <Button onClick={handleSave} disabled={saving}>
      {saving ? (
        <><Icon name="progress_activity" size={16} className="animate-spin" />{t('common.loading')}</>
      ) : (
        <><Icon name="save" size={16} />{t('common.save')}</>
      )}
    </Button>
  )

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('profile.title')} action={SaveButton} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Avatar / summary card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <AvatarUpload
              initialAvatarUrl={user.avatarUrl}
              name={form.name || user.email}
              size={96}
              onUpdated={() => onUpdated?.()}
            />
            <div>
              <div className="text-base font-semibold text-foreground">{form.name || user.email}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </div>
            <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary">
              <Icon name="personal_injury" size={12} fill />
              {t('role.patient')}
            </Badge>

            {/* Profile completion progress */}
            <ProfileCompletion form={form} t={t} />
          </CardContent>
        </Card>

        {/* Personal info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="person" size={18} fill className="text-primary" />
              {t('profile.personalInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('common.name')}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label={t('common.phone')}>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+1…" />
            </Field>
            <Field label={t('common.country')}>
              <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
            </Field>
            <Field label={t('common.city')}>
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label={t('profile.preferredLanguage')}>
              <Select value={form.preferredLanguage} onValueChange={(v) => set('preferredLanguage', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l: Locale) => (
                    <SelectItem key={l} value={l}>
                      {LOCALE_META[l].flag} {LOCALE_META[l].native}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        {/* Medical info */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="medical_information" size={18} fill className="text-primary" />
              {t('profile.medicalInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('common.dateOfBirth')}>
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />
            </Field>
            <Field label={t('common.gender')}>
              <Select value={form.gender} onValueChange={(v) => set('gender', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('profile.selectGender')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{t('common.male')}</SelectItem>
                  <SelectItem value="FEMALE">{t('common.female')}</SelectItem>
                  <SelectItem value="OTHER">{t('common.other')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('common.bloodGroup')}>
              <Select value={form.bloodGroup} onValueChange={(v) => set('bloodGroup', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('profile.selectBlood')} />
                </SelectTrigger>
                <SelectContent>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                    <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('common.passportNumber')}>
              <Input value={form.passportNumber} onChange={(e) => set('passportNumber', e.target.value)} />
            </Field>
            <Field label={t('common.emergencyContact')}>
              <Input
                value={form.emergencyContact}
                onChange={(e) => set('emergencyContact', e.target.value)}
                placeholder="+90…"
              />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label={t('common.medicalHistory')}>
                <Textarea
                  value={form.medicalHistory}
                  onChange={(e) => set('medicalHistory', e.target.value)}
                  rows={4}
                  placeholder="…"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky save bar on mobile */}
      <div className="flex justify-end gap-2 lg:hidden">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? (
            <><Icon name="progress_activity" size={16} className="animate-spin" />{t('common.loading')}</>
          ) : (
            <><Icon name="save" size={16} />{t('common.save')}</>
          )}
        </Button>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="gap-0">
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={`item-${i}`} className="h-16" />)}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={`item-${i}`} className="h-16" />)}
        </CardContent>
      </Card>
    </div>
  )
}

/* =========================================================================
 * Section: Favorites — saved providers
 * ======================================================================= */

function FavoritesSection() {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const { data, loading, error, refetch } = useApi<{ favorites: any[] }>('/api/favorites')

  async function removeFav(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await apiPost('/api/favorites', { providerId: id, providerType: 'DOCTOR', providerUserId: '' })
      refetch()
      toast.success(t('favorites.removed'))
    } catch (e: any) { toast.error(e.message) }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`fav-skel-${i}`} className="h-48 rounded-[16px]" />)}
      </div>
    )
  }

  if (error) return <ErrorState message={error} onRetry={refetch} />

  const favorites = data?.favorites || []

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon="favorite_border"
        title={t('favorites.empty')}
        description={t('favorites.emptyDesc')}
        action={<Button onClick={() => goDashboard('browse')}><Icon name="travel_explore" size={16} />{t('favorites.browseProviders')}</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('favorites.title')} subtitle={`${favorites.length} ${favorites.length === 1 ? 'provider' : 'providers'}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {favorites.map((f) => (
          <Card key={f.providerId} className="group flex cursor-pointer flex-col gap-0 transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => goDashboard('browse')}>
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <ProviderAvatar name={f.name} avatarUrl={f.avatarUrl} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate font-semibold text-foreground">{f.name || '—'}</h3>
                    {f.verified && <Icon name="verified" size={16} fill className="shrink-0 text-primary" />}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">{f.specialty}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon name="location_on" size={12} />
                    <span className="truncate">{[f.city, f.country].filter(Boolean).join(', ')}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => removeFav(f.providerId, e)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-error transition-colors hover:bg-error/10"
                  title={t('favorites.removed')}
                >
                  <Icon name="favorite" size={18} fill />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <StarRating rating={f.rating || 0} size={14} showValue count={f.reviewCount} />
                <div className="text-end">
                  <div className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(f.price, 'USD', locale)}</div>
                  <div className="text-[11px] text-muted-foreground">{f.priceLabel}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* =========================================================================
 * Section: Booking Detail Dialog — full timeline
 * ======================================================================= */

/* =========================================================================
 * Reschedule Dialog — pick a new slot
 * ======================================================================= */

function RescheduleDialog({ booking, open, onOpenChange, onDone }: {
  booking: Booking | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const { t, locale } = useT()
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!booking) return
    setLoading(true)
    setSelected(null)
    // Build provider query based on provider type
    const params = new URLSearchParams()
    if (booking.doctor?.id) params.set('doctorId', booking.doctor.id)
    if (booking.hospital?.id) params.set('hospitalId', booking.hospital.id)
    if (booking.translator?.id) params.set('translatorId', booking.translator.id)
    fetch(`/api/providers/slots?${params}`)
      .then(r => r.json())
      .then(d => setSlots(d.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false))
  }, [booking?.id])

  // Group slots by date
  const grouped: Record<string, any[]> = {}
  for (const s of slots) {
    const key = new Date(s.startTime).toISOString().slice(0, 10)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  }
  const sortedDates = Object.keys(grouped).sort()

  async function handleReschedule() {
    if (!booking || !selected) return
    setSubmitting(true)
    try {
      await apiPost('/api/bookings/reschedule', { bookingId: booking.id, newSlotId: selected })
      toast.success(t('booking.rescheduleSuccess'))
      onOpenChange(false)
      onDone()
    } catch (e: any) { toast.error(e.message) } finally { setSubmitting(false) }
  }

  if (!booking) return null
  const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="event_repeat" size={20} className="text-primary" />
            {t('booking.rescheduleTitle')}
          </DialogTitle>
          <DialogDescription>
            {providerName} · {t('booking.rescheduleDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`resched-skel-${i}`} className="h-14 w-full rounded-[14px]" />)}
            </div>
          ) : slots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Icon name="event_busy" size={32} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('booking.noSlots')}</p>
            </div>
          ) : (
            sortedDates.map((dateKey) => {
              const daySlots = grouped[dateKey]
              const date = new Date(dateKey)
              return (
                <div key={dateKey}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => {
                      const time = new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(s.startTime))
                      const isSel = selected === s.id
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelected(s.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
                            isSel ? 'border-primary bg-primary text-primary-foreground' : 'border-divider bg-surface text-foreground hover:border-primary/40'
                          )}
                        >
                          <Icon name={s.visitType === 'ONLINE' ? 'videocam' : 'person'} size={12} />
                          {time}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('common.cancel')}</Button>
          <Button onClick={handleReschedule} disabled={submitting || !selected} className="gap-1.5">
            {submitting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="check_circle" size={16} />}
            {t('booking.rescheduleConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function handleAddToCalendar(booking: any) {
  const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'
  const startTime = new Date(booking.startDate)
  const endTime = booking.endDate ? new Date(booking.endDate) : new Date(startTime.getTime() + 60 * 60 * 1000) // default 1 hour
  const visitType = booking.visitType === 'ONLINE' ? 'Online consultation' : 'In-person visit'
  const location = booking.videoSessionUrl || (booking.doctor?.city || booking.hospital?.city || '') || 'TBD'

  downloadICal(`medtravel-booking-${booking.id.slice(-8)}`, {
    uid: booking.id,
    title: `${visitType} with ${providerName}`,
    description: `MedTravel booking\nProvider: ${providerName}\nVisit type: ${visitType}\nBooking ID: ${booking.id}\n${booking.notes ? 'Notes: ' + booking.notes : ''}`,
    location,
    startTime,
    endTime,
    organizer: { name: 'MedTravel', email: 'noreply@medtravel.com' },
  })
  toast.success('Calendar event downloaded')
}

function BookingDetailDialog({ booking, open, onOpenChange, onOpenDispute }: {
  booking: any
  open: boolean
  onOpenChange: (o: boolean) => void
  onOpenDispute?: (booking: any) => void
}) {
  const { t, locale } = useT()
  const goMessages = useApp((s) => s.goMessages)
  if (!booking) return null

  const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'
  const providerType = booking.providerType

  // Build timeline
  const timeline: { label: string; date: string; icon: string; color: string; done: boolean }[] = [
    { label: t('booking.created'), date: formatDateTime(booking.createdAt, locale), icon: 'event_available', color: 'bg-primary/10 text-primary', done: true },
    { label: t('booking.confirmed'), date: booking.payment?.status === 'SUCCEEDED' ? formatDateTime(booking.createdAt, locale) : '—', icon: 'verified', color: 'bg-success/10 text-success', done: booking.payment?.status === 'SUCCEEDED' },
  ]
  if (booking.status === 'COMPLETED') {
    timeline.push({ label: t('booking.completedAt'), date: booking.endDate ? formatDateTime(booking.endDate, locale) : '—', icon: 'task_alt', color: 'bg-success/10 text-success', done: true })
  }
  if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
    timeline.push({ label: t('booking.cancelledAt'), date: booking.cancelledAt ? formatDateTime(booking.cancelledAt, locale) : '—', icon: 'event_busy', color: 'bg-error/10 text-error', done: true })
    if (booking.refundAmount && parseFloat(booking.refundAmount) > 0) {
      timeline.push({ label: t('booking.refundProcessed'), date: formatCurrency(booking.refundAmount, 'USD', locale), icon: 'undo', color: 'bg-warning/10 text-warning', done: true })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="receipt_long" size={20} className="text-primary" />
            {t('booking.detailTitle')}
          </DialogTitle>
          <DialogDescription>
            {providerName} · {booking.visitType === 'ONLINE' ? t('booking.online') : t('booking.inPerson')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={cn('rounded-full border', statusBadgeClass(booking.status))}>
              {t(statusLabelKey(booking.status))}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDateTime(booking.startDate, locale)}</span>
          </div>

          {/* Trip Tracker — visual progress timeline */}
          <TripTracker booking={booking} />

          {/* PENDING info banner */}
          {booking.status === 'PENDING' && (
            <Alert className="border-warning/30 bg-warning/5">
              <Icon name="hourglass_top" size={18} className="text-warning" />
              <AlertDescription className="text-sm text-foreground">
                {t('patient.pendingApproval')}
              </AlertDescription>
            </Alert>
          )}

          {/* Timeline */}
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('booking.timeline')}</p>
            <div className="space-y-3">
              {timeline.map((item, i) => (
                <div key={`tl-${i}`} className="flex items-start gap-3">
                  <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', item.color)}>
                    <Icon name={item.icon} size={16} fill />
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment info — patient only sees the amount they paid (internal commission is never exposed) */}
          <div className="rounded-[14px] border border-divider bg-surface-secondary/50 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('booking.paymentInfo')}</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('common.amount')}</span>
              <span className="font-medium text-foreground">{formatCurrency(booking.amount, 'USD', locale)}</span>
            </div>
          </div>

          {/* Video link for online visits */}
          {booking.visitType === 'ONLINE' && booking.videoSessionUrl && booking.status === 'CONFIRMED' && (
            <Button asChild variant="success" className="w-full gap-2">
              <a href={booking.videoSessionUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="videocam" size={18} />
                {t('booking.videoJoin')}
              </a>
            </Button>
          )}

          {/* Open the dedicated chat page — only for active/completed bookings */}
          {(booking.status === 'CONFIRMED' || booking.status === 'COMPLETED' || booking.status === 'PENDING') && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => goMessages(booking.id)}
            >
              <Icon name="forum" size={18} fill />
              {t('chat.openChat')}
            </Button>
          )}

          {/* Download Invoice — for CONFIRMED or COMPLETED bookings */}
          {(booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') && (
            <Button asChild variant="outline" className="w-full gap-2">
              <a href={`/api/invoices/${booking.id}`} target="_blank" rel="noopener noreferrer">
                <Icon name="receipt_long" size={18} />
                {t('common.downloadInvoice')}
              </a>
            </Button>
          )}

          {/* Notes */}
          {booking.notes && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('common.notes')}</p>
              <p className="rounded-[14px] border border-divider bg-surface p-3 text-sm text-foreground">{booking.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {booking.status === 'CONFIRMED' && (
            <Button
              variant="outline"
              onClick={() => handleAddToCalendar(booking)}
              className="w-full gap-2 sm:w-auto"
            >
              <Icon name="event_available" size={16} />
              {t('booking.addToCalendar')}
            </Button>
          )}
          {(booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') && (
            <Button
              variant="outline"
              onClick={() => { onOpenChange(false); onOpenDispute?.(booking) }}
              className="w-full gap-2 text-error hover:bg-error/5 sm:w-auto"
            >
              <Icon name="gavel" size={16} />
              {t('dispute.openDispute')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">{t('booking.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Dispute Dialog — open a dispute for a booking
 * ======================================================================= */

function DisputeDialog({ booking, open, onOpenChange, onDone }: {
  booking: Booking | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const { t } = useT()
  const [type, setType] = useState<'REFUND_REQUEST' | 'SERVICE_QUALITY' | 'SCHEDULING_ISSUE' | 'PAYMENT_ISSUE' | 'OTHER'>('SERVICE_QUALITY')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setType('SERVICE_QUALITY')
      setTitle('')
      setDescription('')
    }
  }, [open])

  async function handleSubmit() {
    if (!booking || title.trim().length < 3 || description.trim().length < 10) return
    setSubmitting(true)
    try {
      await apiPost('/api/disputes', {
        bookingId: booking.id,
        type,
        title: title.trim(),
        description: description.trim(),
      })
      toast.success(t('dispute.disputeOpened'))
      onOpenChange(false)
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!booking) return null

  const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="gavel" size={20} className="text-error" />
            {t('dispute.openDispute')}
          </DialogTitle>
          <DialogDescription>
            {providerName} · {t('dispute.disputeDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dispute type */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('dispute.disputeType')}</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="REFUND_REQUEST">{t('dispute.typeRefund')}</SelectItem>
                <SelectItem value="SERVICE_QUALITY">{t('dispute.typeService')}</SelectItem>
                <SelectItem value="SCHEDULING_ISSUE">{t('dispute.typeSchedule')}</SelectItem>
                <SelectItem value="PAYMENT_ISSUE">{t('dispute.typePayment')}</SelectItem>
                <SelectItem value="OTHER">{t('dispute.typeOther')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('dispute.disputeTitle')}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of the issue"
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('dispute.disputeReason')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail (min 10 characters)..."
              rows={4}
              maxLength={2000}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{description.length}/2000</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('common.cancel')}</Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || title.trim().length < 3 || description.trim().length < 10}
            className="gap-1.5"
          >
            {submitting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="gavel" size={16} />}
            {t('dispute.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Section: Patient Disputes — view disputes they raised or are against them
 * ======================================================================= */

function PatientDisputesSection() {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const { data, loading, error, refetch } = useApi<{ disputes: any[] }>('/api/disputes')

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title={t('dispute.title')} />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`dispute-skel-${i}`} className="h-28 w-full rounded-[16px]" />)}
        </div>
      </div>
    )
  }

  if (error) return <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>

  const disputes = data?.disputes || []

  if (disputes.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title={t('dispute.title')} />
        <EmptyState
          icon="gavel"
          title={t('dispute.noDisputes')}
          description={t('dispute.noDisputesDesc')}
          action={<Button onClick={() => goDashboard('bookings')} className="gap-1.5"><Icon name="event" size={16} />{t('dash.bookings')}</Button>}
        />
      </div>
    )
  }

  const statusBadge: Record<string, { cls: string; key: string }> = {
    OPEN: { cls: 'bg-warning/10 text-warning border-warning/20', key: 'dispute.open' },
    UNDER_REVIEW: { cls: 'bg-info/10 text-info border-info/20', key: 'dispute.underReview' },
    RESOLVED: { cls: 'bg-success/10 text-success border-success/20', key: 'dispute.resolved' },
    CLOSED: { cls: 'bg-muted text-muted-foreground border-divider', key: 'dispute.closed' },
  }
  const typeIcon: Record<string, string> = {
    REFUND_REQUEST: 'undo', SERVICE_QUALITY: 'thumb_down', SCHEDULING_ISSUE: 'event_busy', PAYMENT_ISSUE: 'payments', OTHER: 'help',
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('dispute.title')} subtitle={`${disputes.length} ${disputes.length === 1 ? 'dispute' : 'disputes'}`} />
      <div className="space-y-3">
        {disputes.map((d) => {
          const badge = statusBadge[d.status] || statusBadge.OPEN
          const providerName = d.booking?.doctor?.user?.name || d.booking?.hospital?.name || d.booking?.hotel?.name || d.booking?.translator?.user?.name || '—'
          return (
            <Card key={d.id} className="gap-0 transition-all hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-surface-secondary text-muted-foreground">
                    <Icon name={typeIcon[d.type] || 'help'} size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{d.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{providerName} · {formatCurrency(d.booking?.amount || '0', 'USD', locale)}</p>
                      </div>
                      <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium', badge.cls)}>
                        {t(badge.key)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{d.description}</p>
                    {d.adminResponse && (
                      <div className="mt-3 rounded-[12px] border-s-2 border-primary bg-accent/20 p-3">
                        <div className="flex items-center gap-1.5">
                          <Icon name="reply" size={12} className="text-primary" />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{t('dispute.adminResponse')}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground">{d.adminResponse}</p>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Icon name="schedule" size={12} />
                      <span>{relativeTime(d.createdAt, locale)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* =========================================================================
 * Section: Documents — medical document upload and management
 * ======================================================================= */

const DOC_CATEGORY_CONFIG: Record<string, { icon: string; cls: string; key: string }> = {
  prescription: { icon: 'medication', cls: 'bg-primary/10 text-primary', key: 'documents.cat.prescription' },
  test_result: { icon: 'biotech', cls: 'bg-success/10 text-success', key: 'documents.cat.test_result' },
  insurance: { icon: 'health_and_safety', cls: 'bg-info/10 text-info', key: 'documents.cat.insurance' },
  passport: { icon: 'badge', cls: 'bg-warning/10 text-warning', key: 'documents.cat.passport' },
  other: { icon: 'description', cls: 'bg-muted text-muted-foreground', key: 'documents.cat.other' },
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function DocumentsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ documents: VaultDocument[] }>('/api/medical-records')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [accessTarget, setAccessTarget] = useState<VaultDocument | null>(null)

  const documents = data?.documents || []

  function handleAccessUpdated(updated: VaultDocument) {
    // Optimistically patch the local cache so the share count updates
    // immediately without a full refetch.
    refetch()
  }

  // Group by category
  const grouped: Record<string, any[]> = {}
  for (const d of documents) {
    if (!grouped[d.category]) grouped[d.category] = []
    grouped[d.category].push(d)
  }

  function downloadDoc(doc: any) {
    const a = document.createElement('a')
    a.href = doc.dataUrl
    a.download = doc.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/documents?id=${deleteTarget}`)
      toast.success(t('documents.deleted'))
      setDeleteTarget(null)
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={t('documents.title')}
        subtitle={t('documents.desc')}
        action={
          <Button onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Icon name="upload_file" size={18} />
            {t('documents.upload')}
          </Button>
        }
      />

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={() => { setUploadOpen(false); refetch() }} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`doc-skel-${i}`} className="h-32 rounded-[16px]" />)}
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon="folder_shared"
          title={t('documents.empty')}
          description={t('documents.emptyDesc')}
          action={<Button onClick={() => setUploadOpen(true)} className="gap-1.5"><Icon name="upload_file" size={16} />{t('documents.upload')}</Button>}
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, docs]) => {
            const cfg = DOC_CATEGORY_CONFIG[cat] || DOC_CATEGORY_CONFIG.other
            return (
              <div key={cat}>
                <div className="mb-3 flex items-center gap-2">
                  <div className={cn('flex size-7 items-center justify-center rounded-[8px]', cfg.cls)}>
                    <Icon name={cfg.icon} size={16} fill />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{t(cfg.key)}</h3>
                  <span className="text-xs text-muted-foreground">({docs.length})</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {docs.map((doc) => (
                    <Card key={doc.id} className="group gap-0 transition-all hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-[10px]', cfg.cls)}>
                            <Icon name={cfg.icon} size={20} fill />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{doc.fileName}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(doc.fileSize)} · {relativeTime(doc.createdAt, locale)}</p>
                            {doc.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.notes}</p>}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadDoc(doc)} className="gap-1.5 flex-1">
                            <Icon name="download" size={14} />
                            {t('documents.download')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAccessTarget(doc as VaultDocument)}
                            className="gap-1.5 flex-1"
                            title={t('vault.manageAccess', 'Manage Access')}
                          >
                            <Icon name="share" size={14} />
                            {t('vault.share', 'Share')}
                            {doc.accessGrants && doc.accessGrants.length > 0 && (
                              <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 justify-center px-1 text-[10px]">
                                {doc.accessGrants.length}
                              </Badge>
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(doc.id)} className="text-error hover:bg-error/5" title={t('documents.delete')}>
                            <Icon name="delete" size={14} />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="warning" size={20} className="text-error" />
              {t('documents.delete')}
            </DialogTitle>
            <DialogDescription>{t('documents.deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} className="gap-1.5">
              <Icon name="delete" size={16} />
              {t('documents.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Access dialog — grant/revoke doctor access to a document */}
      <ManageAccessDialog
        open={!!accessTarget}
        onOpenChange={(o) => !o && setAccessTarget(null)}
        document={accessTarget}
        onUpdated={handleAccessUpdated}
      />
    </div>
  )
}

function UploadDialog({ open, onOpenChange, onUploaded }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onUploaded: () => void
}) {
  const { t } = useT()
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<string>('prescription')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setCategory('prescription')
      setNotes('')
    }
  }, [open])

  function handleFileSelect(f: File | null) {
    if (!f) return
    if (f.size > 5_000_000) {
      toast.error(t('documents.fileTooLarge'))
      return
    }
    setFile(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      try {
        await apiPost('/api/documents', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          category,
          dataUrl,
          notes: notes || undefined,
        })
        toast.success(t('documents.uploaded'))
        onUploaded()
      } catch (e: any) {
        toast.error(e.message || t('documents.uploadError'))
      } finally {
        setUploading(false)
      }
    }
    reader.onerror = () => {
      toast.error(t('documents.uploadError'))
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="upload_file" size={20} className="text-primary" />
            {t('documents.upload')}
          </DialogTitle>
          <DialogDescription>{t('documents.maxSize')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category select */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('documents.category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prescription">{t('documents.cat.prescription')}</SelectItem>
                <SelectItem value="test_result">{t('documents.cat.test_result')}</SelectItem>
                <SelectItem value="insurance">{t('documents.cat.insurance')}</SelectItem>
                <SelectItem value="passport">{t('documents.cat.passport')}</SelectItem>
                <SelectItem value="other">{t('documents.cat.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File drop zone */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('documents.fileName')}</Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2 rounded-[16px] border-2 border-dashed p-8 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-divider hover:border-primary/40 hover:bg-surface-secondary/50'
              )}
            >
              {file ? (
                <>
                  <Icon name="description" size={32} className="text-primary" />
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </>
              ) : (
                <>
                  <Icon name="cloud_upload" size={32} className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('documents.dragDrop')}</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="hidden"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('documents.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="..."
              rows={2}
              maxLength={500}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>{t('common.cancel')}</Button>
          <Button onClick={handleUpload} disabled={uploading || !file} className="gap-1.5">
            {uploading ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="upload" size={16} />}
            {t('documents.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Section: Recycle Bin — patient's soft-deleted medical documents
 * ======================================================================= */

function PatientRecycleBinSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ documents: any[] }>('/api/medical-records/recycle-bin')
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const documents = data?.documents || []

  async function handleRestore(id: string) {
    try {
      await apiPatch('/api/medical-records/recycle-bin', { id })
      toast.success(t('common.restore', 'Restored'))
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    }
  }

  async function handlePermanentDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await apiDelete(`/api/medical-records/recycle-bin?id=${confirmDelete.id}`)
      toast.success(t('common.deletePermanently', 'Permanently deleted'))
      setConfirmDelete(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title={t('admin.recycleBin', 'Recycle Bin')} />
        <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeader title={t('admin.recycleBin', 'Recycle Bin')} />
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{error}</CardContent></Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={t('admin.recycleBin', 'Recycle Bin')}
        subtitle={t('recycleBin.desc', 'Restore or permanently delete items. Items are automatically purged after 30 days.')}
      />

      {/* Warning banner */}
      <div className="flex items-start gap-2 rounded-[12px] border border-warning/20 bg-warning/5 p-3.5">
        <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-xs text-muted-foreground">
          {t('recycleBin.warning', 'Items in the recycle bin are automatically permanently deleted after 30 days. Permanent deletion cannot be undone.')}
        </p>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon="delete_sweep"
          title={t('recycleBin.empty', 'Recycle bin is empty')}
          description={t('recycleBin.emptyDesc', 'Deleted items will appear here for 30 days.')}
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const cfg = DOC_CATEGORY_CONFIG[doc.category] || DOC_CATEGORY_CONFIG.other
            return (
              <Card key={doc.id} className="gap-0">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-[10px]', cfg.cls)}>
                      <Icon name={cfg.icon} size={20} fill />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{doc.fileName}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>·</span>
                        <span>{t(cfg.key)}</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Icon name="delete" size={12} />
                          {relativeTime(doc.deletedAt, locale)}
                        </span>
                      </div>
                      {doc.accessGrants && doc.accessGrants.length > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          <Icon name="share" size={10} className="me-0.5 inline" />
                          {doc.accessGrants.length} doctor(s) had access
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(doc.id)}
                        className="gap-1.5"
                      >
                        <Icon name="restore" size={14} />
                        <span className="hidden sm:inline">{t('common.restore', 'Restore')}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete({ id: doc.id, name: doc.fileName })}
                        className="text-error hover:bg-error/5"
                        title={t('common.deletePermanently', 'Delete Permanently')}
                      >
                        <Icon name="delete_forever" size={14} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Permanent delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="warning" size={20} className="text-error" />
              {t('common.deletePermanently', 'Delete Permanently')}
            </DialogTitle>
            <DialogDescription>
              {t('recycleBin.permanentConfirm', 'Are you sure you want to permanently delete')} <span className="font-semibold text-foreground">{confirmDelete?.name}</span>?
              {t('recycleBin.permanentWarning', ' This action cannot be undone.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handlePermanentDelete} disabled={deleting} className="gap-1.5">
              {deleting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="delete_forever" size={16} />}
              {t('common.deletePermanently', 'Delete Permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* =========================================================================
 * Main component
 * ======================================================================= */

export function PatientDashboard({ section }: { section: string }) {
  switch (section) {
    case 'overview': return <OverviewSection />
    case 'browse': return <BrowseSection />
    case 'compare': return <CompareSection />
    case 'favorites': return <FavoritesSection />
    case 'bookings': return <BookingsSection />
    case 'itineraries': return <ItinerariesSection />
    case 'messages': return <MessagesSection />
    case 'documents': return <DocumentsSection />
    case 'recycle-bin': return <PatientRecycleBinSection />
    case 'disputes': return <PatientDisputesSection />
    case 'reviews': return <ReviewsSection />
    case 'tickets': return <TicketsSection />
    case 'profile': return <ProfileSection />
    default: return <OverviewSection />
  }
}
