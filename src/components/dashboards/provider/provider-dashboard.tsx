'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useApp } from '@/stores/app-store'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost, apiPut, apiPatch, apiDelete } from '@/hooks/use-api'
import { Icon } from '@/components/shared/icon'
import { StarRating } from '@/components/shared/star-rating'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { MessagesSection } from '@/components/chat/messages-section'
import { downloadICal } from '@/lib/ical'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { formatCurrency, formatDate, formatDateTime, relativeTime } from '@/lib/money'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* =========================================================================
 * Types
 * ======================================================================= */

type Balance = { available: string; pending: string; lifetime: string; paidOut: string }

type Patient = { id?: string; name: string | null; email?: string | null; avatarUrl?: string | null }

type Service = {
  id: string
  name: string
  description: string
  price: string
  currency: string
  durationMinutes: number | null
  isActive: boolean
  providerType: string
}

type Slot = {
  id: string
  startTime: string
  endTime: string
  visitType: 'IN_PERSON' | 'ONLINE'
  isBooked: boolean
}

type Booking = {
  id: string
  patient: Patient
  providerType: string
  visitType: 'IN_PERSON' | 'ONLINE'
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'REFUNDED'
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
  service?: { id: string; name: string } | null
  slot?: { id: string; startTime: string; endTime: string } | null
  payment?: { id: string; status: string; amount: string; refundAmount?: string } | null
  review?: { id: string; rating: number; comment: string } | null
  doctor?: { city: string; country: string } | null
  createdAt: string
}

type Payout = {
  id: string
  providerType: string
  amount: string
  currency: string
  status: 'PENDING' | 'COMPLETED'
  method: string
  reference: string | null
  periodStart: string
  periodEnd: string
  completedAt: string | null
  createdAt: string
}

type Review = {
  id: string
  rating: number
  comment: string
  createdAt: string
  author: { name: string | null; avatarUrl: string | null }
  reply?: string | null
  repliedAt?: string | null
}

type StatsResponse = {
  totalBookings: number
  upcoming: number
  completed: number
  balance: Balance
  rating: number
  reviewCount: number
  providerName: string
  recentBookings: Booking[]
}

type ProfileUser = {
  id: string
  name: string | null
  email: string
  phone: string | null
  country: string | null
  city: string | null
  preferredLanguage: string
  avatarUrl: string | null
  doctor?: any
  hospital?: any
  hotel?: any
  translator?: any
}

/* =========================================================================
 * Helpers
 * ======================================================================= */

function initials(name?: string | null) {
  if (!name) return '?'
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useT()
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    PENDING: { label: t('common.pending'), cls: 'bg-warning/15 text-warning-foreground border-warning/30', icon: 'pending' },
    CONFIRMED: { label: t('common.confirmed'), cls: 'bg-info/15 text-info border-info/30', icon: 'check_circle' },
    COMPLETED: { label: t('common.completed'), cls: 'bg-success/15 text-success border-success/30', icon: 'check_circle' },
    CANCELLED: { label: t('common.cancelled'), cls: 'bg-error/10 text-error border-error/30', icon: 'cancel' },
    NO_SHOW: { label: t('common.noShow'), cls: 'bg-error/10 text-error border-error/30', icon: 'person_off' },
    REFUNDED: { label: t('common.refund'), cls: 'bg-muted text-muted-foreground border-divider', icon: 'undo' },
  }
  const conf = map[status] || map.PENDING
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', conf.cls)}>
      <Icon name={conf.icon} size={12} fill />
      {conf.label}
    </span>
  )
}

function VisitTypePill({ visitType }: { visitType: string }) {
  const { t } = useT()
  const isOnline = visitType === 'ONLINE'
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
      isOnline ? 'bg-primary/10 text-primary' : 'bg-surface-secondary text-muted-foreground',
    )}>
      <Icon name={isOnline ? 'videocam' : 'location_on'} size={12} fill />
      {isOnline ? t('common.onlineVisit') : t('common.inPersonVisit')}
    </span>
  )
}

function PageHeader({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        {icon && <Icon name={icon} size={26} className="text-primary" fill />}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-divider bg-surface px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary text-muted-foreground">
        <Icon name={icon} size={28} fill />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={`item-${i}`} className="h-16 w-full rounded-[14px]" />
        ))}
      </CardContent>
    </Card>
  )
}

function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-error/30 bg-error/5 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
        <Icon name="error" size={24} fill />
      </div>
      <p className="mt-3 text-sm text-foreground">{message || t('common.error')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4 gap-1.5">
          <Icon name="refresh" size={16} />
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <Card className="gap-0">
      <CardContent className="p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-20" />
        <Skeleton className="mt-3 h-3 w-16" />
      </CardContent>
    </Card>
  )
}

function RowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={`item-${i}`}><Skeleton className="h-5 w-full max-w-[120px]" /></TableCell>
      ))}
    </TableRow>
  )
}

/* =========================================================================
 * Section: Overview
 * ======================================================================= */

function OverviewSection({ role }: { role: string }) {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const { data, loading, error, refetch } = useApi<StatsResponse>('/api/stats')
  const { data: profileData } = useApi<{ user: any }>('/api/profile')

  // Find provider ID for public profile link
  const providerId = profileData?.user?.doctor?.id || profileData?.user?.hospital?.id || profileData?.user?.hotel?.id || profileData?.user?.translator?.id || ''

  async function shareProfile() {
    if (!providerId) return
    const url = `${window.location.origin}/?profile=${role}:${providerId}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('public.profileCopied'))
    } catch {
      window.open(url, '_blank')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dash.overview')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={`item-${i}`} />)}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dash.overview')} />
        <ErrorState message={error || undefined} onRetry={refetch} />
      </div>
    )
  }

  const balance = data.balance || { available: '0', pending: '0', lifetime: '0', paidOut: '0' }
  const roleIcon = role === 'DOCTOR' ? 'medical_services' : role === 'HOSPITAL' ? 'local_hospital' : role === 'HOTEL' ? 'hotel' : 'translate'

  const stats = [
    { label: t('stat.totalBookings'), value: String(data.totalBookings ?? 0), icon: 'event', tint: 'bg-primary/10 text-primary' },
    { label: t('stat.upcoming'), value: String(data.upcoming ?? 0), icon: 'schedule', tint: 'bg-info/10 text-info' },
    { label: t('stat.completedVisits'), value: String(data.completed ?? 0), icon: 'check_circle', tint: 'bg-success/10 text-success' },
    { label: t('stat.rating'), value: data.rating ? data.rating.toFixed(1) : '—', icon: 'star', tint: 'bg-warning/10 text-warning' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dash.overview')}
        description={data.providerName ? `${t('role.' + role.toLowerCase())} · ${data.providerName}` : t('role.' + role.toLowerCase())}
        action={providerId ? (
          <Button variant="outline" size="sm" onClick={shareProfile} className="gap-1.5">
            <Icon name="share" size={16} />
            <span className="hidden sm:inline">{t('public.shareProfile')}</span>
          </Button>
        ) : undefined}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-0">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{s.value}</p>
                </div>
                <div className={cn('flex size-10 items-center justify-center rounded-full', s.tint)}>
                  <Icon name={s.icon} size={20} fill />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Earnings + Recent bookings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Earnings */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="account_balance" size={18} className="text-success" fill />
              {t('provider.earningsTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('provider.balance')}</p>
              <p className="mt-1 text-3xl font-semibold text-success">{formatCurrency(balance.available, 'USD', locale)}</p>
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('provider.pendingBalance')}</span>
                <span className="font-medium text-foreground">{formatCurrency(balance.pending, 'USD', locale)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('provider.lifetimeEarnings')}</span>
                <span className="font-medium text-foreground">{formatCurrency(balance.lifetime, 'USD', locale)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('provider.paidOut')}</span>
                <span className="font-medium text-foreground">{formatCurrency(balance.paidOut, 'USD', locale)}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-surface-secondary px-3 py-2 text-xs text-muted-foreground">
              <Icon name="schedule" size={14} fill />
              {t('provider.weeklySettlement')}
            </div>
          </CardContent>
        </Card>

        {/* Recent bookings */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="event" size={18} className="text-primary" fill />
              {t('provider.recentBookings')}
            </CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => goDashboard(role === 'HOTEL' ? 'bookings' : 'appointments')} className="gap-1.5 text-primary">
                {t('common.viewAll')}
                <Icon name="chevron_right" size={16} className="rtl:rotate-180" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-4">
            {data.recentBookings && data.recentBookings.length > 0 ? (
              <ul className="flex flex-col divide-y divide-divider">
                {data.recentBookings.slice(0, 6).map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Avatar className="size-10">
                      {b.patient?.avatarUrl ? <AvatarImage src={b.patient.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(b.patient?.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{b.patient?.name || '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.service?.name || t('booking.inPerson')} · {formatDate(b.startDate, locale)}
                      </p>
                    </div>
                    <div className="hidden text-end sm:block">
                      <p className="text-sm font-medium text-foreground">{formatCurrency(b.amount, 'USD', locale)}</p>
                      <p className="text-xs text-muted-foreground">{relativeTime(b.createdAt, locale)}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-surface-secondary text-muted-foreground">
                  <Icon name={roleIcon} size={24} fill />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{t('provider.noBookings')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="bolt" size={18} className="text-warning" fill />
            {t('provider.quickActions')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <QuickAction icon="add_circle" label={t('provider.addService')} desc={t('dash.services')} onClick={() => goDashboard('services')} />
            {role !== 'HOTEL' && (
              <QuickAction icon="calendar_month" label={t('provider.addAvailability')} desc={t('dash.availability')} onClick={() => goDashboard('availability')} />
            )}
            <QuickAction icon="reviews" label={t('provider.viewReviews')} desc={t('dash.reviews')} onClick={() => goDashboard('reviews')} />
            <QuickAction icon="account_balance" label={t('dash.payouts')} desc={t('provider.earningsTitle')} onClick={() => goDashboard('payouts')} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function QuickAction({ icon, label, desc, onClick }: { icon: string; label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-[14px] border border-divider bg-surface p-4 text-start transition-all hover:border-primary/40 hover:bg-surface-secondary"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon name={icon} size={20} fill />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{desc}</p>
      </div>
      <Icon name="chevron_right" size={18} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
    </button>
  )
}

/* =========================================================================
 * Section: Appointments / Bookings
 * ======================================================================= */

function AppointmentsSection({ role }: { role: string }) {
  const { t, locale } = useT()
  const [filter, setFilter] = useState<string>('all')
  const { data, loading, error, refetch } = useApi<{ bookings: Booking[] }>('/api/bookings')

  const bookings = useMemo(() => {
    if (!data?.bookings) return []
    if (filter === 'all') return data.bookings
    return data.bookings.filter((b) => b.status === filter.toUpperCase())
  }, [data, filter])

  const titleKey = role === 'HOTEL' ? 'dash.bookings' : 'dash.appointments'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t(titleKey)} description={`${t('common.status')}: ${bookings.length}`} />

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="h-10">
          <TabsTrigger value="all" className="gap-1.5 px-3"><Icon name="list" size={14} />{t('common.all')}</TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5 px-3"><Icon name="pending" size={14} />{t('common.pending')}</TabsTrigger>
          <TabsTrigger value="confirmed" className="gap-1.5 px-3"><Icon name="check_circle" size={14} />{t('common.confirmed')}</TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5 px-3"><Icon name="task_alt" size={14} />{t('common.completed')}</TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-1.5 px-3"><Icon name="cancel" size={14} />{t('common.cancelled')}</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          <Card className="gap-0">
            <CardContent className="p-0">
              {loading ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="ps-4">{t('common.patient')}</TableHead>
                      <TableHead>{t('common.visitType')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('common.amount')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="pe-4 text-end">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={`item-${i}`} cols={6} />)}
                  </TableBody>
                </Table>
              ) : error ? (
                <div className="p-4"><ErrorState message={error} onRetry={refetch} /></div>
              ) : bookings.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon="event_available" title={t('provider.noBookings')} />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="ps-4">{t('common.patient')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('common.visitType')}</TableHead>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead>{t('common.amount')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="pe-4 text-end">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((b) => (
                      <BookingRow key={b.id} booking={b} t={t} locale={locale} onDone={refetch} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BookingRow({ booking, t, locale, onDone }: { booking: Booking; t: (k: string, fb?: string) => string; locale: string; onDone: () => void }) {
  const goMessages = useApp((s) => s.goMessages)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Dispute form state
  const [disputeType, setDisputeType] = useState<'REFUND_REQUEST' | 'SERVICE_QUALITY' | 'SCHEDULING_ISSUE' | 'PAYMENT_ISSUE' | 'OTHER'>('OTHER')
  const [disputeTitle, setDisputeTitle] = useState('')
  const [disputeDesc, setDisputeDesc] = useState('')

  async function handleComplete() {
    setBusy(true)
    try {
      await apiPost('/api/bookings/complete', { bookingId: booking.id })
      toast.success(t('booking.confirmCompletion'))
      setCompleteOpen(false)
      onDone()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleAccept() {
    setBusy(true)
    try {
      await apiPost('/api/bookings/accept', { bookingId: booking.id })
      toast.success('Booking accepted')
      onDone()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDecline() {
    setBusy(true)
    try {
      await apiPost('/api/bookings/decline', { bookingId: booking.id, reason: reason || undefined })
      toast.success('Booking declined')
      setDeclineOpen(false)
      setReason('')
      onDone()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    setBusy(true)
    try {
      await apiPost('/api/bookings/cancel', { bookingId: booking.id, reason: reason || undefined })
      toast.success(t('booking.cancelBooking'))
      setCancelOpen(false)
      setReason('')
      onDone()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleNoShow() {
    setBusy(true)
    try {
      await apiPost('/api/bookings/no-show', { bookingId: booking.id })
      toast.success('Marked as no-show')
      onDone()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDispute() {
    if (disputeTitle.trim().length < 3 || disputeDesc.trim().length < 10) return
    setBusy(true)
    try {
      await apiPost('/api/disputes', {
        bookingId: booking.id,
        type: disputeType,
        title: disputeTitle.trim(),
        description: disputeDesc.trim(),
      })
      toast.success(t('dispute.disputeOpened'))
      setDisputeOpen(false)
      setDisputeTitle('')
      setDisputeDesc('')
      setDisputeType('OTHER')
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  function handleAddToCalendar() {
    const startTime = new Date(booking.startDate)
    const endTime = booking.endDate ? new Date(booking.endDate) : new Date(startTime.getTime() + 60 * 60 * 1000)
    const visitType = booking.visitType === 'ONLINE' ? 'Online consultation' : 'In-person visit'
    downloadICal(`medtravel-booking-${booking.id.slice(-8)}`, {
      uid: booking.id,
      title: `${visitType} with ${booking.patient?.name || 'Patient'}`,
      description: `MedTravel booking\nPatient: ${booking.patient?.name || '—'}\nVisit type: ${visitType}\nBooking ID: ${booking.id}`,
      location: booking.videoSessionUrl || booking.doctor?.city || '',
      startTime,
      endTime,
    })
    toast.success(t('booking.calendarAdded'))
  }

  const isConfirmed = booking.status === 'CONFIRMED'
  const isPending = booking.status === 'PENDING'
  const isOnline = booking.visitType === 'ONLINE'

  return (
    <TableRow>
      <TableCell className="ps-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            {booking.patient?.avatarUrl ? <AvatarImage src={booking.patient.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">{initials(booking.patient?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{booking.patient?.name || '—'}</p>
            <p className="truncate text-xs text-muted-foreground">{booking.patient?.email || ''}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <VisitTypePill visitType={booking.visitType} />
      </TableCell>
      <TableCell>
        <p className="text-sm text-foreground">{formatDate(booking.startDate, locale)}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(booking.startDate, locale).split(',').pop()?.trim()}</p>
      </TableCell>
      <TableCell>
        <p className="text-sm font-medium text-foreground">{formatCurrency(booking.amount, 'USD', locale)}</p>
        <p className="text-xs text-muted-foreground">{t('common.youNet')}: {formatCurrency(booking.providerNetAmount, 'USD', locale)}</p>
      </TableCell>
      <TableCell><StatusBadge status={booking.status} /></TableCell>
      <TableCell className="pe-4">
        <div className="flex items-center justify-end gap-1.5">
          {/* Open the dedicated chat page */}
          {(booking.status === 'PENDING' || booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => goMessages(booking.id)}
              title={t('chat.openChat')}
            >
              <Icon name="forum" size={14} fill />
              <span className="hidden sm:inline">{t('chat.openChat')}</span>
            </Button>
          )}
          {/* Accept & Decline for PENDING bookings */}
          {isPending && (
            <>
              <Button
                variant="success"
                size="sm"
                className="gap-1.5"
                onClick={handleAccept}
                disabled={busy}
              >
                <Icon name="check_circle" size={14} fill />
                <span className="hidden sm:inline">Accept</span>
              </Button>
              <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-error hover:bg-error/5 hover:text-error"
                    disabled={busy}
                  >
                    <Icon name="close" size={14} />
                    <span className="hidden sm:inline">Decline</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Decline booking</DialogTitle>
                    <DialogDescription>
                      {booking.patient?.name} · {booking.service?.name || t('booking.inPerson')} · {formatCurrency(booking.amount, 'USD', locale)}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="decline-reason">Reason (optional)</Label>
                    <Textarea
                      id="decline-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Schedule conflict, not available…"
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">The patient will receive a full refund.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeclineOpen(false)} disabled={busy}>{t('common.close')}</Button>
                    <Button variant="destructive" onClick={handleDecline} disabled={busy} className="gap-1.5">
                      {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="close" size={14} />}
                      Decline booking
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
          {isConfirmed && isOnline && booking.videoSessionUrl && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(booking.videoSessionUrl!, '_blank', 'noopener')}
            >
              <Icon name="videocam" size={14} fill />
              <span className="hidden sm:inline">{t('common.joinVideo')}</span>
            </Button>
          )}
          {isConfirmed && (
            <>
              {/* Calendar export */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleAddToCalendar}
                title={t('booking.addToCalendar')}
              >
                <Icon name="event_available" size={14} />
                <span className="hidden lg:inline">{t('booking.addToCalendar')}</span>
              </Button>

              <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="success" size="sm" className="gap-1.5">
                    <Icon name="task_alt" size={14} fill />
                    <span className="hidden sm:inline">{t('booking.markComplete')}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('booking.confirmCompletion')}</DialogTitle>
                    <DialogDescription>
                      {booking.patient?.name} · {booking.service?.name || t('booking.inPerson')} · {formatCurrency(booking.amount, 'USD', locale)}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-[14px] bg-surface-secondary p-4 text-sm text-muted-foreground">
                    {t('booking.providerReceives')}: <span className="font-semibold text-success">{formatCurrency(booking.providerNetAmount, 'USD', locale)}</span>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={busy}>{t('common.close')}</Button>
                    <Button variant="success" onClick={handleComplete} disabled={busy} className="gap-1.5">
                      {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="check_circle" size={14} fill />}
                      {t('common.confirm')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-error hover:bg-error/5 hover:text-error">
                    <Icon name="close" size={14} />
                    <span className="hidden sm:inline">{t('common.cancel')}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('booking.cancelBooking')}</DialogTitle>
                    <DialogDescription>{booking.patient?.name} · {formatDate(booking.startDate, locale)}</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="cancel-reason">{t('booking.cancelReason')}</Label>
                    <Textarea
                      id="cancel-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t('common.cancelReasonPlaceholder')}
                      rows={3}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>{t('common.close')}</Button>
                    <Button variant="destructive" onClick={handleCancel} disabled={busy} className="gap-1.5">
                      {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="close" size={14} />}
                      {t('booking.cancelBooking')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* No-Show button */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-warning hover:bg-warning/5 hover:text-warning"
                onClick={handleNoShow}
                disabled={busy}
                title="Mark as no-show"
              >
                <Icon name="person_off" size={14} />
                <span className="hidden lg:inline">No-show</span>
              </Button>

              {/* Open dispute button + dialog */}
              <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-error hover:bg-error/5" title={t('dispute.openDispute')}>
                    <Icon name="gavel" size={14} />
                    <span className="hidden lg:inline">{t('dispute.openDispute')}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Icon name="gavel" size={20} className="text-error" />
                      {t('dispute.openDispute')}
                    </DialogTitle>
                    <DialogDescription>
                      {booking.patient?.name} · {t('dispute.disputeDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">{t('dispute.disputeType')}</Label>
                      <Select value={disputeType} onValueChange={(v: any) => setDisputeType(v)}>
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
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">{t('dispute.disputeTitle')}</Label>
                      <Input value={disputeTitle} onChange={(e) => setDisputeTitle(e.target.value)} placeholder="Brief summary of the issue" maxLength={200} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">{t('dispute.disputeReason')}</Label>
                      <Textarea value={disputeDesc} onChange={(e) => setDisputeDesc(e.target.value)} placeholder="Describe the issue in detail (min 10 characters)..." rows={4} maxLength={2000} className="resize-none" />
                      <p className="text-xs text-muted-foreground">{disputeDesc.length}/2000</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDisputeOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
                    <Button variant="destructive" onClick={handleDispute} disabled={busy || disputeTitle.trim().length < 3 || disputeDesc.trim().length < 10} className="gap-1.5">
                      {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="gavel" size={14} />}
                      {t('dispute.submit')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
          {!isConfirmed && booking.status !== 'COMPLETED' && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {booking.status === 'COMPLETED' && (
            <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-error hover:bg-error/5" title={t('dispute.openDispute')}>
                  <Icon name="gavel" size={14} />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="gavel" size={20} className="text-error" />
                    {t('dispute.openDispute')}
                  </DialogTitle>
                  <DialogDescription>
                    {booking.patient?.name} · {t('dispute.disputeDesc')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">{t('dispute.disputeType')}</Label>
                    <Select value={disputeType} onValueChange={(v: any) => setDisputeType(v)}>
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
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">{t('dispute.disputeTitle')}</Label>
                    <Input value={disputeTitle} onChange={(e) => setDisputeTitle(e.target.value)} placeholder="Brief summary of the issue" maxLength={200} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">{t('dispute.disputeReason')}</Label>
                    <Textarea value={disputeDesc} onChange={(e) => setDisputeDesc(e.target.value)} placeholder="Describe the issue in detail..." rows={4} maxLength={2000} className="resize-none" />
                    <p className="text-xs text-muted-foreground">{disputeDesc.length}/2000</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDisputeOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
                  <Button variant="destructive" onClick={handleDispute} disabled={busy || disputeTitle.trim().length < 3 || disputeDesc.trim().length < 10} className="gap-1.5">
                    {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="gavel" size={14} />}
                    {t('dispute.submit')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

/* =========================================================================
 * Section: Services
 * ======================================================================= */

function ServicesSection({ role }: { role: string }) {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ services: Service[] }>('/api/services')
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dash.services')}
        description={t('provider.serviceDescription')}
        action={
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Icon name="add" size={18} fill />
            {t('provider.addService')}
          </Button>
        }
      />

      <AddServiceDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => { setAddOpen(false); refetch() }} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={`item-${i}`}><CardContent className="p-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data?.services || data.services.length === 0 ? (
        <EmptyState
          icon="medical_services"
          title={t('provider.noServices')}
          action={<Button onClick={() => setAddOpen(true)} className="gap-1.5"><Icon name="add" size={16} fill />{t('provider.addService')}</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.services.map((s) => (
            <ServiceCard key={s.id} service={s} t={t} locale={locale} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}

function ServiceCard({ service, t, locale, onChanged }: { service: Service; t: (k: string, fb?: string) => string; locale: string; onChanged: () => void }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggleActive(next: boolean) {
    setBusy(true)
    try {
      await apiPatch('/api/services', { id: service.id, isActive: next })
      onChanged()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await apiDelete(`/api/services?id=${service.id}`)
      toast.success(t('provider.serviceDeleted'))
      setDeleteOpen(false)
      onChanged()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="gap-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-foreground">{service.name}</h3>
              {service.isActive ? (
                <Badge className="bg-success/15 text-success border-success/30">{t('common.active')}</Badge>
              ) : (
                <Badge variant="secondary" className="bg-muted text-muted-foreground">{t('provider.inactive')}</Badge>
              )}
            </div>
            {service.description && (
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{service.description}</p>
            )}
          </div>
          <Switch checked={service.isActive} onCheckedChange={toggleActive} disabled={busy} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('common.price')}</p>
            <p className="font-semibold text-foreground">{formatCurrency(service.price, service.currency || 'USD', locale)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('provider.durationMinutes')}</p>
            <p className="font-semibold text-foreground">
              {service.durationMinutes ? `${service.durationMinutes} ${t('common.minutes')}` : '—'}
            </p>
          </div>
        </div>

        <Separator className="my-4" />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Icon name="edit" size={14} fill />
            {t('common.edit')}
          </Button>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-error hover:bg-error/5 hover:text-error">
                <Icon name="delete" size={14} fill />
                {t('common.delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
                <AlertDialogDescription>{t('provider.confirmDeleteService')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>{t('common.close')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={busy}
                  className="bg-error text-error-foreground hover:bg-error/90 gap-1.5"
                >
                  {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="delete" size={14} fill />}
                  {t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>

      <ServiceFormDialog
        mode="edit"
        service={service}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => { setEditOpen(false); onChanged() }}
      />
    </Card>
  )
}

function AddServiceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  return (
    <ServiceFormDialog
      mode="add"
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onCreated}
    />
  )
}

function ServiceFormDialog({
  mode, service, open, onOpenChange, onSaved,
}: {
  mode: 'add' | 'edit'
  service?: Service
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const { t } = useT()
  const [name, setName] = useState(service?.name || '')
  const [description, setDescription] = useState(service?.description || '')
  const [price, setPrice] = useState(service?.price || '')
  const [duration, setDuration] = useState(service?.durationMinutes ? String(service.durationMinutes) : '')
  const [busy, setBusy] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(service?.name || '')
      setDescription(service?.description || '')
      setPrice(service?.price || '')
      setDuration(service?.durationMinutes ? String(service.durationMinutes) : '')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !price.trim()) {
      toast.error(t('common.error'))
      return
    }
    setBusy(true)
    try {
      const body: any = {
        name: name.trim(),
        description: description.trim(),
        price: price.trim(),
        currency: 'USD',
      }
      if (duration.trim()) body.durationMinutes = parseInt(duration.trim(), 10)

      if (mode === 'add') {
        await apiPost('/api/services', body)
        toast.success(t('provider.serviceCreated'))
      } else if (service) {
        await apiPatch('/api/services', { id: service.id, ...body })
        toast.success(t('provider.serviceUpdated'))
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? t('provider.addService') : t('common.edit')}</DialogTitle>
          <DialogDescription>{t('provider.serviceDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-name">{t('provider.serviceName')}</Label>
            <Input id="svc-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-desc">{t('provider.serviceDescription')}</Label>
            <Textarea id="svc-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-price">{t('provider.servicePrice')}</Label>
              <Input id="svc-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-dur">{t('provider.serviceDuration')}</Label>
              <Input id="svc-dur" type="number" min="1" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('common.close')}</Button>
            <Button type="submit" disabled={busy} className="gap-1.5">
              {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="save" size={14} fill />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Section: Availability (NOT for hotels)
 * ======================================================================= */

function AvailabilitySection({ role }: { role: string }) {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ slots: Slot[] }>('/api/slots')
  const [addOpen, setAddOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)

  // Hotels shouldn't have a slot calendar — show a friendly notice instead
  if (role === 'HOTEL') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dash.availability')} />
        <EmptyState icon="hotel" title={t('provider.hotelsNoSlots')} />
      </div>
    )
  }

  // Group slots by date for calendar view
  const slots = data?.slots || []
  const grouped: Record<string, Slot[]> = {}
  for (const s of slots) {
    const key = new Date(s.startTime).toISOString().slice(0, 10)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  }
  const sortedDates = Object.keys(grouped).sort()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dash.availability')}
        description={t('provider.addSlot')}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRecurringOpen(true)} className="gap-1.5">
              <Icon name="event_repeat" size={18} />
              {t('availability.recurring')}
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Icon name="add" size={18} fill />
              {t('provider.addSlot')}
            </Button>
          </div>
        }
      />

      <AddSlotDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => { setAddOpen(false); refetch() }} />
      <RecurringSlotsDialog open={recurringOpen} onOpenChange={setRecurringOpen} onCreated={() => { setRecurringOpen(false); refetch() }} />

      {loading ? (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="ps-4">{t('common.date')}</TableHead>
              <TableHead>{t('common.time')}</TableHead>
              <TableHead>{t('common.visitType')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="pe-4 text-end">{t('common.actions')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={`item-${i}`} cols={5} />)}</TableBody>
          </Table>
        </CardContent></Card>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : slots.length === 0 ? (
        <EmptyState
          icon="calendar_month"
          title={t('provider.noSlots')}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRecurringOpen(true)} className="gap-1.5"><Icon name="event_repeat" size={16} />{t('availability.recurring')}</Button>
              <Button onClick={() => setAddOpen(true)} className="gap-1.5"><Icon name="add" size={16} fill />{t('provider.addSlot')}</Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Calendar-style grouped view */}
          {sortedDates.map((dateKey) => {
            const daySlots = grouped[dateKey]
            const date = new Date(dateKey)
            const isToday = dateKey === new Date().toISOString().slice(0, 10)
            return (
              <Card key={dateKey} className="gap-0">
                <CardHeader className="border-b border-divider pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className={`flex size-8 items-center justify-center rounded-[8px] ${isToday ? 'bg-primary text-primary-foreground' : 'bg-surface-secondary text-muted-foreground'}`}>
                      <Icon name="calendar_today" size={16} fill />
                    </span>
                    <span className="font-medium">{new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date)}</span>
                    <span className="text-xs text-muted-foreground">· {daySlots.length} {daySlots.length === 1 ? 'slot' : 'slots'}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((slot) => (
                      <SlotChip key={slot.id} slot={slot} t={t} locale={locale} onDeleted={refetch} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SlotChip({ slot, t, locale, onDeleted }: { slot: Slot; t: (k: string, fb?: string) => string; locale: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timeFmt = new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })

  async function handleDelete() {
    setBusy(true)
    try {
      await apiDelete(`/api/slots?id=${slot.id}`)
      toast.success(t('provider.slotDeleted'))
      onDeleted()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <div className={`group relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all ${
        slot.isBooked
          ? 'border-success/30 bg-success/5 text-success'
          : 'border-divider bg-surface text-foreground hover:border-error/30 hover:bg-error/5'
      }`}>
        <Icon name={slot.visitType === 'ONLINE' ? 'videocam' : 'person'} size={14} />
        <span className="font-medium tabular-nums">{timeFmt.format(new Date(slot.startTime))}</span>
        {slot.isBooked ? (
          <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">{t('availability.booked')}</span>
        ) : (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t('availability.available')}</span>
        )}
        {!slot.isBooked && (
          <button
            onClick={() => setOpen(true)}
            disabled={busy}
            className="ms-1 flex size-5 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-error/10 hover:text-error group-hover:opacity-100"
            title={t('common.delete')}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('provider.deleteSlot')}</AlertDialogTitle>
          <AlertDialogDescription>{t('provider.confirmDeleteSlot')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={busy} className="bg-error text-error-foreground hover:bg-error/90">
            {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RecurringSlotsDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { t } = useT()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]) // Mon-Fri by default
  const [visitType, setVisitType] = useState<'IN_PERSON' | 'ONLINE'>('IN_PERSON')
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)

  const DAY_LABELS = [
    { day: 0, key: 'availability.sun' },
    { day: 1, key: 'availability.mon' },
    { day: 2, key: 'availability.tue' },
    { day: 3, key: 'availability.wed' },
    { day: 4, key: 'availability.thu' },
    { day: 5, key: 'availability.fri' },
    { day: 6, key: 'availability.sat' },
  ]

  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  async function handleSubmit() {
    if (!startDate || !endDate || days.length === 0) return
    setBusy(true)
    try {
      const res = await apiPost('/api/slots/bulk', { startDate, endDate, daysOfWeek: days, startTime, endTime, visitType, slotDurationMinutes: duration })
      toast.success(t('availability.slotsCreated').replace('{count}', String(res.created)))
      onCreated()
    } catch (e: any) {
      toast.error(e.message)
    } finally { setBusy(false) }
  }

  // Default dates: today and +30 days
  useEffect(() => {
    if (!startDate) {
      const today = new Date()
      const future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      setStartDate(today.toISOString().slice(0, 10))
      setEndDate(future.toISOString().slice(0, 10))
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="event_repeat" size={20} className="text-primary" />
            {t('availability.recurring')}
          </DialogTitle>
          <DialogDescription>{t('availability.recurringDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('availability.startDate')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('availability.endDate')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Days of week */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('availability.daysOfWeek')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map(({ day, key }) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`flex size-9 items-center justify-center rounded-[10px] text-sm font-medium transition-all ${
                    days.includes(day)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-secondary text-muted-foreground hover:bg-divider'
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('availability.startTime')}</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('availability.endTime')}</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Visit type + duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('availability.visitType')}</Label>
              <Select value={visitType} onValueChange={(v: any) => setVisitType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_PERSON">{t('booking.inPerson')}</SelectItem>
                  <SelectItem value="ONLINE">{t('booking.online')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('availability.slotDuration')}</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="45">45</SelectItem>
                  <SelectItem value="60">60</SelectItem>
                  <SelectItem value="90">90</SelectItem>
                  <SelectItem value="120">120</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={busy || !startDate || !endDate || days.length === 0} className="gap-1.5">
            {busy ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="event_repeat" size={16} />}
            {t('availability.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SlotRow({ slot, t, locale, onDeleted }: { slot: Slot; t: (k: string, fb?: string) => string; locale: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    setBusy(true)
    try {
      await apiDelete(`/api/slots?id=${slot.id}`)
      toast.success(t('provider.slotDeleted'))
      setOpen(false)
      onDeleted()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const start = new Date(slot.startTime)
  const end = new Date(slot.endTime)
  const timeStr = `${start.toLocaleTimeString(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })} — ${end.toLocaleTimeString(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <TableRow>
      <TableCell className="ps-4">
        <p className="text-sm font-medium text-foreground">{formatDate(slot.startTime, locale)}</p>
      </TableCell>
      <TableCell>
        <p className="text-sm text-foreground">{timeStr}</p>
      </TableCell>
      <TableCell><VisitTypePill visitType={slot.visitType} /></TableCell>
      <TableCell>
        {slot.isBooked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
            <Icon name="event_available" size={12} fill />
            {t('provider.booked')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <Icon name="event_available" size={12} fill />
            {t('provider.available')}
          </span>
        )}
      </TableCell>
      <TableCell className="pe-4 text-end">
        {slot.isBooked ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-error hover:bg-error/5 hover:text-error">
                <Icon name="delete" size={14} fill />
                {t('common.delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('provider.deleteSlot')}</AlertDialogTitle>
                <AlertDialogDescription>{t('provider.confirmDeleteSlot')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>{t('common.close')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={busy} className="bg-error text-error-foreground hover:bg-error/90 gap-1.5">
                  {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="delete" size={14} fill />}
                  {t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  )
}

function AddSlotDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { t } = useT()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [visitType, setVisitType] = useState<'IN_PERSON' | 'ONLINE'>('IN_PERSON')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      // Default start = now+1h rounded to 30, end = +30min
      const now = new Date()
      now.setMinutes(now.getMinutes() + 60 - (now.getMinutes() % 30), 0, 0)
      const later = new Date(now.getTime() + 30 * 60000)
      const toLocal = (d: Date) => {
        const off = d.getTimezoneOffset()
        return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
      }
      setStart(toLocal(now))
      setEnd(toLocal(later))
      setVisitType('IN_PERSON')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!start || !end) {
      toast.error(t('common.error'))
      return
    }
    const s = new Date(start)
    const en = new Date(end)
    if (en <= s) {
      toast.error(t('common.error'))
      return
    }
    setBusy(true)
    try {
      await apiPost('/api/slots', { startTime: s.toISOString(), endTime: en.toISOString(), visitType })
      toast.success(t('provider.slotCreated'))
      onCreated()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('provider.addSlot')}</DialogTitle>
          <DialogDescription>{t('dash.availability')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-start">{t('provider.slotStart')}</Label>
              <Input id="slot-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-end">{t('provider.slotEnd')}</Label>
              <Input id="slot-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('provider.visitType')}</Label>
            <Select value={visitType} onValueChange={(v) => setVisitType(v as 'IN_PERSON' | 'ONLINE')}>
              <SelectTrigger className="h-12 w-full rounded-[14px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_PERSON">{t('common.inPersonVisit')}</SelectItem>
                <SelectItem value="ONLINE">{t('common.onlineVisit')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('common.close')}</Button>
            <Button type="submit" disabled={busy} className="gap-1.5">
              {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="add" size={14} fill />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Section: Reviews
 * ======================================================================= */

function ReviewsSection() {
  const { t, locale } = useT()
  const session = useApp((s) => s.session)
  const subjectUserId = session?.id
  const { data, loading, error, refetch } = useApi<{ reviews: Review[]; avg: number; count: number }>(
    subjectUserId ? `/api/reviews?subjectUserId=${subjectUserId}` : null
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('dash.reviews')} />

      {loading ? (
        <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.count === 0 ? (
        <EmptyState
          icon="reviews"
          title={t('provider.noReviews')}
          description={t('provider.noReviewsDesc')}
        />
      ) : (
        <>
          {/* Hero */}
          <Card className="gap-0">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
                <div className="text-center">
                  <p className="text-5xl font-semibold text-foreground">{data.avg.toFixed(1)}</p>
                  <div className="mt-1 flex justify-center">
                    <StarRating rating={data.avg} size={20} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{data.count} {t('common.reviews').toLowerCase()}</p>
                </div>
                <Separator orientation="vertical" className="hidden h-20 sm:block" />
                <div className="flex-1 text-center sm:text-start">
                  <h2 className="text-lg font-semibold text-foreground">
                    {data.avg >= 4.5 ? t('common.verified') : data.avg >= 3.5 ? t('common.active') : t('dash.reviews')}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.count} {t('common.reviews').toLowerCase()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* List */}
          <div className="flex flex-col gap-3">
            {data.reviews.map((r) => (
              <ReviewCard key={r.id} review={r} onReplied={refetch} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ReviewCard({ review, onReplied }: { review: Review; onReplied: () => void }) {
  const { t, locale } = useT()
  const [showReply, setShowReply] = useState(false)
  const [replyText, setReplyText] = useState(review.reply || '')
  const [busy, setBusy] = useState(false)

  async function submitReply() {
    if (replyText.trim().length < 2) return
    setBusy(true)
    try {
      await apiPost('/api/reviews/reply', { reviewId: review.id, reply: replyText.trim() })
      toast.success(t('review.replySubmitted'))
      setShowReply(false)
      onReplied()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Card className="gap-0">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(review.author?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{review.author?.name || '—'}</p>
              <StarRating rating={review.rating} size={14} />
              <span className="text-xs text-muted-foreground">· {relativeTime(review.createdAt, locale)}</span>
            </div>
            {review.comment && (
              <p className="mt-2 text-sm text-foreground">{review.comment}</p>
            )}

            {/* Provider reply */}
            {review.reply && !showReply && (
              <div className="mt-3 rounded-[14px] border-s-2 border-primary bg-accent/30 p-3">
                <div className="flex items-center gap-1.5">
                  <Icon name="reply" size={14} className="text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">{t('review.replyTitle')}</span>
                  {review.repliedAt && <span className="text-xs text-muted-foreground">· {relativeTime(review.repliedAt, locale)}</span>}
                </div>
                <p className="mt-1.5 text-sm text-foreground">{review.reply}</p>
                <button
                  onClick={() => { setShowReply(true); setReplyText(review.reply || '') }}
                  className="mt-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {t('review.editReply')}
                </button>
              </div>
            )}

            {/* Reply form */}
            {showReply ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={t('review.replyPlaceholder')}
                  rows={3}
                  className="resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={submitReply} disabled={busy || replyText.trim().length < 2} className="gap-1.5">
                    {busy ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="send" size={14} />}
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowReply(false); setReplyText(review.reply || '') }}>{t('common.cancel')}</Button>
                </div>
              </div>
            ) : !review.reply && (
              <button
                onClick={() => setShowReply(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Icon name="reply" size={14} />
                {t('review.reply')}
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* =========================================================================
 * Section: Payouts
 * ======================================================================= */

function PayoutsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ balance: Balance; payouts: Payout[] }>('/api/payouts')

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dash.payouts')} />
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dash.payouts')} />
        <ErrorState message={error || undefined} onRetry={refetch} />
      </div>
    )
  }

  const balance = data.balance || { available: '0', pending: '0', lifetime: '0', paidOut: '0' }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('dash.payouts')} description={t('provider.payoutsNote')} />

      {/* Balance summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 border-success/30">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">{t('provider.balance')}</p>
            <p className="mt-2 text-2xl font-semibold text-success">{formatCurrency(balance.available, 'USD', locale)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('provider.weeklySettlementShort')}</p>
          </CardContent>
        </Card>
        <Card className="gap-0">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">{t('provider.pendingBalance')}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(balance.pending, 'USD', locale)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">{t('provider.lifetimeEarnings')}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(balance.lifetime, 'USD', locale)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">{t('provider.paidOut')}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(balance.paidOut, 'USD', locale)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payout history */}
      <Card className="gap-0">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="receipt_long" size={18} className="text-primary" fill />
            {t('provider.payoutHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {!data.payouts || data.payouts.length === 0 ? (
            <EmptyState icon="payments" title={t('provider.noPayouts')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('common.period')}</TableHead>
                  <TableHead>{t('common.amount')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('common.method')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('common.reference')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payouts.map((p) => {
                  const done = p.status === 'COMPLETED'
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="text-sm text-foreground">{formatDate(p.createdAt, locale)}</p>
                        <p className="text-xs text-muted-foreground">{relativeTime(p.createdAt, locale)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-foreground">{formatDate(p.periodStart, locale)}</p>
                        <p className="text-xs text-muted-foreground">— {formatDate(p.periodEnd, locale)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(p.amount, p.currency || 'USD', locale)}</p>
                      </TableCell>
                      <TableCell>
                        {done ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                            <Icon name="check_circle" size={12} fill />
                            {t('common.completed')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                            <Icon name="pending" size={12} fill />
                            {t('common.pending')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{p.method || '—'}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">{p.reference || '—'}</span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* =========================================================================
 * Section: Profile
 * ======================================================================= */

function ProfileSection({ role }: { role: string }) {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ user: ProfileUser }>('/api/profile')

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dash.profile')} />
        <Card><CardContent className="p-6"><Skeleton className="h-96 w-full" /></CardContent></Card>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dash.profile')} />
        <ErrorState message={error || undefined} onRetry={refetch} />
      </div>
    )
  }

  return <ProfileForm user={data.user} role={role} t={t} locale={locale} onSaved={refetch} />
}

function ProfileForm({ user, role, t, locale, onSaved }: {
  user: ProfileUser
  role: string
  t: (k: string, fb?: string) => string
  locale: string
  onSaved: () => void
}) {
  // Common fields
  const [name, setName] = useState(user.name || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [country, setCountry] = useState(user.country || '')
  const [city, setCity] = useState(user.city || '')
  const [preferredLanguage, setPreferredLanguage] = useState(user.preferredLanguage || 'en')

  // Doctor
  const d = user.doctor
  const [specialty, setSpecialty] = useState(d?.specialty || '')
  const [subSpecialties, setSubSpecialties] = useState(d?.subSpecialties || '')
  const [bio, setBio] = useState(d?.bio || '')
  const [yearsExperience, setYearsExperience] = useState(d?.yearsExperience != null ? String(d.yearsExperience) : '')
  const [consultationFee, setConsultationFee] = useState(d?.consultationFee || '')
  const [onlineFee, setOnlineFee] = useState(d?.onlineFee || '')
  const [languages, setLanguages] = useState(d?.languages || '')
  const [education, setEducation] = useState(d?.education || '')
  const [certifications, setCertifications] = useState(d?.certifications || '')

  // Hospital
  const h = user.hospital
  const [hospitalName, setHospitalName] = useState(h?.name || '')
  const [hospitalDesc, setHospitalDesc] = useState(h?.description || '')
  const [hospitalAddr, setHospitalAddr] = useState(h?.address || '')
  const [departments, setDepartments] = useState(h?.departments || '')
  const [accreditations, setAccreditations] = useState(h?.accreditations || '')
  const [beds, setBeds] = useState(h?.beds != null ? String(h.beds) : '')
  const [baseFee, setBaseFee] = useState(h?.baseFee || '')
  const [hospitalLangs, setHospitalLangs] = useState(h?.languages || '')

  // Hotel
  const ho = user.hotel
  const [hotelName, setHotelName] = useState(ho?.name || '')
  const [hotelDesc, setHotelDesc] = useState(ho?.description || '')
  const [hotelAddr, setHotelAddr] = useState(ho?.address || '')
  const [starRating, setStarRating] = useState(ho?.starRating != null ? String(ho.starRating) : '3')
  const [amenities, setAmenities] = useState(ho?.amenities || '')
  const [roomTypes, setRoomTypes] = useState(ho?.roomTypes || '')
  const [pricePerNight, setPricePerNight] = useState(ho?.pricePerNight || '')
  const [hotelLangs, setHotelLangs] = useState(ho?.languages || '')

  // Translator
  const tr = user.translator
  const [translatorLangs, setTranslatorLangs] = useState(tr?.languages || '')
  const [specialization, setSpecialization] = useState(tr?.specialization || 'medical')
  const [translatorBio, setTranslatorBio] = useState(tr?.bio || '')
  const [hourlyRate, setHourlyRate] = useState(tr?.hourlyRate || '')
  const [dailyRate, setDailyRate] = useState(tr?.dailyRate || '')
  const [translatorYears, setTranslatorYears] = useState(tr?.yearsExperience != null ? String(tr.yearsExperience) : '')

  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const body: any = {
        name, phone, country, city,
        preferredLanguage: preferredLanguage as 'en' | 'tr' | 'fa' | 'ar',
      }
      if (role === 'DOCTOR') {
        Object.assign(body, {
          specialty, subSpecialties, bio,
          yearsExperience: yearsExperience ? parseInt(yearsExperience, 10) : 0,
          consultationFee, onlineFee, languages, education, certifications,
        })
      } else if (role === 'HOSPITAL') {
        Object.assign(body, {
          hospitalName, description: hospitalDesc, address: hospitalAddr,
          departments, accreditations,
          beds: beds ? parseInt(beds, 10) : 0,
          baseFee, languages: hospitalLangs,
        })
      } else if (role === 'HOTEL') {
        Object.assign(body, {
          hotelName, description: hotelDesc, address: hotelAddr,
          starRating: starRating ? parseInt(starRating, 10) : 3,
          amenities, roomTypes, pricePerNight, languages: hotelLangs,
        })
      } else if (role === 'TRANSLATOR') {
        Object.assign(body, {
          languages: translatorLangs, specialization,
          bio: translatorBio,
          hourlyRate, dailyRate,
          yearsExperience: translatorYears ? parseInt(translatorYears, 10) : 0,
        })
      }
      await apiPut('/api/profile', body)
      toast.success(t('provider.profileUpdated'))
      onSaved()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const roleIcon = role === 'DOCTOR' ? 'medical_services' : role === 'HOSPITAL' ? 'local_hospital' : role === 'HOTEL' ? 'hotel' : 'translate'
  const roleColor = role === 'DOCTOR' ? 'border-primary/20 bg-primary/5 text-primary' : role === 'HOSPITAL' ? 'border-info/20 bg-info/5 text-info' : role === 'HOTEL' ? 'border-warning/20 bg-warning/5 text-warning' : 'border-[#9334E6]/20 bg-[#9334E6]/5 text-[#9334E6]'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('dash.profile')} description={t('provider.profileSection')} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Common */}
        <Card className="gap-0">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="account_circle" size={18} className="text-primary" fill />
              {t('provider.commonFields')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Avatar */}
            <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
              <AvatarUpload
                initialAvatarUrl={user.avatarUrl}
                name={name || user.email}
                size={80}
                onUpdated={() => onSaved()}
              />
              <div className="text-center sm:text-start">
                <p className="text-sm font-medium text-foreground">{name || user.email}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <Badge variant="outline" className={cn('mt-1.5 rounded-full', roleColor)}>
                  <Icon name={roleIcon} size={12} fill />
                  {t('role.' + role.toLowerCase())}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('common.name')}>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t('common.phone')}>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+90..." />
              </Field>
              <Field label={t('common.country')}>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </Field>
              <Field label={t('common.city')}>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label={t('provider.preferredLanguage')}>
                <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                  <SelectTrigger className="h-12 w-full rounded-[14px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="tr">Türkçe</SelectItem>
                    <SelectItem value="fa">فارسی</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Role-specific */}
        <Card className="gap-0">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name={roleIcon} size={18} className="text-primary" fill />
              {t('role.' + role.toLowerCase())}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {role === 'DOCTOR' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('common.specialty')}>
                  <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Cardiology" />
                </Field>
                <Field label={t('provider.subSpecialties')} hint={t('common.commaSeparated')}>
                  <Input value={subSpecialties} onChange={(e) => setSubSpecialties(e.target.value)} placeholder="Interventional, Echo" />
                </Field>
                <Field label={t('provider.yearsExperience')}>
                  <Input type="number" min="0" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} />
                </Field>
                <Field label={t('provider.consultationFee')}>
                  <Input type="number" min="0" step="0.01" value={consultationFee} onChange={(e) => setConsultationFee(e.target.value)} />
                </Field>
                <Field label={t('provider.onlineFee')}>
                  <Input type="number" min="0" step="0.01" value={onlineFee} onChange={(e) => setOnlineFee(e.target.value)} />
                </Field>
                <Field label={t('common.languages')} hint={t('common.commaSeparated')}>
                  <Input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="en, tr, fa" />
                </Field>
                <Field label={t('provider.education')}>
                  <Input value={education} onChange={(e) => setEducation(e.target.value)} />
                </Field>
                <Field label={t('provider.certifications')} hint={t('common.commaSeparated')}>
                  <Input value={certifications} onChange={(e) => setCertifications(e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t('provider.bio')}>
                    <Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
                  </Field>
                </div>
              </div>
            )}

            {role === 'HOSPITAL' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('provider.hospitalName')}>
                  <Input value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} />
                </Field>
                <Field label={t('provider.beds')}>
                  <Input type="number" min="0" value={beds} onChange={(e) => setBeds(e.target.value)} />
                </Field>
                <Field label={t('provider.baseFee')}>
                  <Input type="number" min="0" step="0.01" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} />
                </Field>
                <Field label={t('common.languages')} hint={t('common.commaSeparated')}>
                  <Input value={hospitalLangs} onChange={(e) => setHospitalLangs(e.target.value)} placeholder="en, tr" />
                </Field>
                <Field label={t('provider.departments')} hint={t('common.commaSeparated')}>
                  <Input value={departments} onChange={(e) => setDepartments(e.target.value)} />
                </Field>
                <Field label={t('provider.accreditations')} hint={t('common.commaSeparated')}>
                  <Input value={accreditations} onChange={(e) => setAccreditations(e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t('provider.address')}>
                    <Input value={hospitalAddr} onChange={(e) => setHospitalAddr(e.target.value)} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label={t('provider.description')}>
                    <Textarea rows={4} value={hospitalDesc} onChange={(e) => setHospitalDesc(e.target.value)} />
                  </Field>
                </div>
              </div>
            )}

            {role === 'HOTEL' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('provider.hotelName')}>
                  <Input value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
                </Field>
                <Field label={t('provider.starRating')}>
                  <Select value={starRating} onValueChange={setStarRating}>
                    <SelectTrigger className="h-12 w-full rounded-[14px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>{'★'.repeat(n)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('provider.pricePerNight')}>
                  <Input type="number" min="0" step="0.01" value={pricePerNight} onChange={(e) => setPricePerNight(e.target.value)} />
                </Field>
                <Field label={t('common.languages')} hint={t('common.commaSeparated')}>
                  <Input value={hotelLangs} onChange={(e) => setHotelLangs(e.target.value)} placeholder="en, tr" />
                </Field>
                <Field label={t('provider.amenities')} hint={t('common.commaSeparated')}>
                  <Input value={amenities} onChange={(e) => setAmenities(e.target.value)} />
                </Field>
                <Field label={t('provider.roomTypes')} hint={t('common.commaSeparated')}>
                  <Input value={roomTypes} onChange={(e) => setRoomTypes(e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t('provider.address')}>
                    <Input value={hotelAddr} onChange={(e) => setHotelAddr(e.target.value)} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label={t('provider.description')}>
                    <Textarea rows={4} value={hotelDesc} onChange={(e) => setHotelDesc(e.target.value)} />
                  </Field>
                </div>
              </div>
            )}

            {role === 'TRANSLATOR' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('common.languages')} hint={t('common.commaSeparated')}>
                  <Input value={translatorLangs} onChange={(e) => setTranslatorLangs(e.target.value)} placeholder="en, tr, fa" />
                </Field>
                <Field label={t('provider.specialization')}>
                  <Select value={specialization} onValueChange={setSpecialization}>
                    <SelectTrigger className="h-12 w-full rounded-[14px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medical">{t('provider.spec.medical')}</SelectItem>
                      <SelectItem value="legal">{t('provider.spec.legal')}</SelectItem>
                      <SelectItem value="general">{t('provider.spec.general')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('provider.yearsExperience')}>
                  <Input type="number" min="0" value={translatorYears} onChange={(e) => setTranslatorYears(e.target.value)} />
                </Field>
                <Field label={t('provider.hourlyRate')}>
                  <Input type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                </Field>
                <Field label={t('provider.dailyRate')}>
                  <Input type="number" min="0" step="0.01" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t('provider.bio')}>
                    <Textarea rows={4} value={translatorBio} onChange={(e) => setTranslatorBio(e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sticky save bar */}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={busy} className="gap-2">
            {busy ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} fill />}
            {t('common.saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center justify-between">
        <span>{label}</span>
        {hint && <span className="text-[11px] font-normal text-muted-foreground">({hint})</span>}
      </Label>
      {children}
    </div>
  )
}

/* =========================================================================
 * Section: Provider Disputes — view disputes raised by/against this provider
 * ======================================================================= */

function ProviderDisputesSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ disputes: any[] }>('/api/disputes')

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dispute.title')} icon="gavel" />
        <LoadingCard lines={3} />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const disputes = data?.disputes || []

  if (disputes.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dispute.title')} icon="gavel" />
        <EmptyState icon="gavel" title={t('dispute.noDisputes')} description={t('dispute.noDisputesDesc')} />
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
    <div className="flex flex-col gap-6">
      <PageHeader title={t('dispute.title')} icon="gavel" />
      <div className="space-y-3">
        {disputes.map((d) => {
          const badge = statusBadge[d.status] || statusBadge.OPEN
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
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t('dispute.raisedBy')}: {d.raisedBy?.name || '—'} · {formatCurrency(d.booking?.amount || '0', 'USD', locale)}
                        </p>
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
 * Main dispatcher
 * ======================================================================= */

export function ProviderDashboard({ section, role }: { section: string; role: string }) {
  switch (section) {
    case 'overview':
      return <OverviewSection role={role} />
    case 'appointments':
    case 'bookings':
      return <AppointmentsSection role={role} />
    case 'messages':
      return <MessagesSection />
    case 'services':
      return <ServicesSection role={role} />
    case 'availability':
      return <AvailabilitySection role={role} />
    case 'reviews':
      return <ReviewsSection />
    case 'disputes':
      return <ProviderDisputesSection />
    case 'analytics':
      return <AnalyticsSection />
    case 'kyc':
      return <KycSection />
    case 'payouts':
      return <PayoutsSection />
    case 'profile':
      return <ProfileSection role={role} />
    default:
      return <OverviewSection role={role} />
  }
}

/* =========================================================================
 * Section: KYC — Doctor identity verification
 * ======================================================================= */

const KYC_DOC_CONFIG: Record<string, { icon: string; cls: string; label: string }> = {
  medical_license: { icon: 'medical_information', cls: 'bg-primary/10 text-primary', label: 'Medical license' },
  id_card: { icon: 'badge', cls: 'bg-warning/10 text-warning', label: 'ID card' },
  diploma: { icon: 'school', cls: 'bg-success/10 text-success', label: 'Diploma / Certificate' },
  passport: { icon: 'passport', cls: 'bg-info/10 text-info', label: 'Passport' },
  other: { icon: 'description', cls: 'bg-muted text-muted-foreground', label: 'Other document' },
}

const KYC_STATUS_CONFIG: Record<string, { cls: string; label: string; icon: string }> = {
  PENDING: { cls: 'bg-warning/10 text-warning border-warning/20', label: 'Pending review', icon: 'hourglass_top' },
  APPROVED: { cls: 'bg-success/10 text-success border-success/20', label: 'Approved', icon: 'check_circle' },
  REJECTED: { cls: 'bg-error/10 text-error border-error/20', label: 'Rejected', icon: 'cancel' },
  NOT_SUBMITTED: { cls: 'bg-muted text-muted-foreground border-divider', label: 'Not submitted', icon: 'info' },
}

function KycSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ documents: any[] }>('/api/kyc')
  const [uploadOpen, setUploadOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('kyc.title')} icon="badge" />
        <LoadingCard lines={3} />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const docs = data?.documents || []
  const hasApproved = docs.some(d => d.status === 'APPROVED')
  const hasPending = docs.some(d => d.status === 'PENDING')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('kyc.title')} description={t('kyc.desc')} icon="badge" />

      {/* Status banner */}
      <Card className={cn('gap-0', hasApproved ? 'border-success/20 bg-success/[0.02]' : hasPending ? 'border-warning/20 bg-warning/[0.02]' : '')}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-[14px]',
            hasApproved ? 'bg-success/10 text-success' : hasPending ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground')}>
            <Icon name={hasApproved ? 'verified_user' : hasPending ? 'hourglass_top' : 'info'} size={24} fill />
          </div>
          <div className="flex-1">
            {hasApproved ? (
              <>
                <p className="text-sm font-semibold text-foreground">{t('kyc.verified')}</p>
                <p className="text-xs text-muted-foreground">{t('kyc.verifiedDesc')}</p>
              </>
            ) : hasPending ? (
              <>
                <p className="text-sm font-semibold text-foreground">{t('kyc.pending')}</p>
                <p className="text-xs text-muted-foreground">Your documents are under review. This usually takes 24-48 hours.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">{t('kyc.empty')}</p>
                <p className="text-xs text-muted-foreground">{t('kyc.emptyDesc')}</p>
              </>
            )}
          </div>
          {!hasApproved && (
            <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5 shrink-0">
              <Icon name="upload_file" size={16} />
              {t('kyc.upload')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Documents list */}
      {docs.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => {
            const cfg = KYC_DOC_CONFIG[doc.docType] || KYC_DOC_CONFIG.other
            const stCfg = KYC_STATUS_CONFIG[doc.status] || KYC_STATUS_CONFIG.NOT_SUBMITTED
            return (
              <Card key={doc.id} className="group gap-0 transition-all hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-[10px]', cfg.cls)}>
                      <Icon name={cfg.icon} size={20} fill />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{cfg.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{doc.fileName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(doc.fileSize)} · {relativeTime(doc.createdAt, locale)}</p>
                      {doc.adminNote && <p className="mt-1 text-xs text-error">{doc.adminNote}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium', stCfg.cls)}>
                      <Icon name={stCfg.icon} size={12} fill />
                      {stCfg.label}
                    </span>
                    {doc.status !== 'APPROVED' && (
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await apiDelete(`/api/kyc?id=${doc.id}`)
                        toast.success(t('kyc.deleted'))
                        refetch()
                      }} className="text-error hover:bg-error/5">
                        <Icon name="delete" size={14} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState icon="badge" title={t('kyc.empty')} description={t('kyc.emptyDesc')} action={
          <Button onClick={() => setUploadOpen(true)} className="gap-1.5"><Icon name="upload_file" size={16} />{t('kyc.upload')}</Button>
        } />
      )}

      <KycUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={() => { setUploadOpen(false); refetch() }} />
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function KycUploadDialog({ open, onOpenChange, onUploaded }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onUploaded: () => void
}) {
  const { t } = useT()
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<string>('medical_license')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setFile(null); setDocType('medical_license'); setNotes('') }
  }, [open])

  function handleFileSelect(f: File | null) {
    if (!f) return
    if (f.size > 5_000_000) { toast.error('File too large (max 5MB)'); return }
    setFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await apiPost('/api/kyc', {
          docType, fileName: file.name, fileType: file.type, fileSize: file.size,
          dataUrl: reader.result, notes: notes || undefined,
        })
        toast.success(t('kyc.uploaded'))
        onUploaded()
      } catch (e: any) { toast.error(e.message) } finally { setUploading(false) }
    }
    reader.readAsDataURL(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon name="upload_file" size={20} className="text-primary" />{t('kyc.upload')}</DialogTitle>
          <DialogDescription>Upload your medical license, ID card, or diploma for verification.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('kyc.docType')}</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="medical_license">{t('kyc.medical_license')}</SelectItem>
                <SelectItem value="id_card">{t('kyc.id_card')}</SelectItem>
                <SelectItem value="diploma">{t('kyc.diploma')}</SelectItem>
                <SelectItem value="passport">{t('kyc.passport')}</SelectItem>
                <SelectItem value="other">{t('kyc.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">File</Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files?.[0] || null) }}
              onClick={() => fileRef.current?.click()}
              className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-[16px] border-2 border-dashed p-8 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-divider hover:border-primary/40 hover:bg-surface-secondary/50')}
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
                  <p className="text-sm text-muted-foreground">Drag and drop a file here, or click to browse</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} className="hidden" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('kyc.notes')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" maxLength={500} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>{t('common.cancel')}</Button>
          <Button onClick={handleUpload} disabled={uploading || !file} className="gap-1.5">
            {uploading ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="upload" size={16} />}
            {t('kyc.upload')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* =========================================================================
 * Section: Analytics — earnings charts, booking trends, performance metrics
 * ======================================================================= */

const PIE_COLORS = ['#1A73E8', '#188038', '#F9AB00', '#D93025', '#9334E6']

function AnalyticsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<any>('/api/analytics')

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('analytics.title')} description={t('analytics.desc')} icon="analytics" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`item-${i}`} className="py-5"><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return <ErrorState message={t('analytics.noData')} onRetry={refetch} />

  const stats = data.totals
  const chartData = data.monthlyEarnings.map((m: any) => ({
    month: m.month,
    earnings: m.earnings,
    bookings: m.bookings,
  }))
  const pieData = [
    { name: t('analytics.inPerson'), value: data.visitTypeBreakdown.inPerson },
    { name: t('analytics.online'), value: data.visitTypeBreakdown.online },
  ].filter(d => d.value > 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('analytics.title')} description={t('analytics.desc')} icon="analytics" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsStatCard icon="payments" label={t('analytics.totalEarnings')} value={formatCurrency(stats.totalEarnings, 'USD', locale)} tone="success" />
        <AnalyticsStatCard icon="trending_up" label={t('analytics.avgBookingValue')} value={formatCurrency(stats.avgBookingValue, 'USD', locale)} tone="primary" />
        <AnalyticsStatCard icon="check_circle" label={t('analytics.completionRate')} value={`${stats.completionRate}%`} tone="info" />
        <AnalyticsStatCard icon="cancel" label={t('analytics.cancellationRate')} value={`${stats.cancellationRate}%`} tone="warning" />
      </div>

      {/* Monthly earnings chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="trending_up" size={18} className="text-primary" />
            {t('analytics.monthlyEarnings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#188038" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#188038" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={{ stroke: '#DADCE0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} width={56}
                  tickFormatter={(v) => formatCurrency(String(v), 'USD', locale).replace(/\.\d+$/, '')} />
                <Tooltip
                  cursor={{ stroke: '#188038', strokeWidth: 1 }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }}
                  formatter={(v: number) => [formatCurrency(String(v), 'USD', locale), t('analytics.revenue')]}
                />
                <Area type="monotone" dataKey="earnings" stroke="#188038" strokeWidth={2} fill="url(#earnGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Two-column: booking trends + visit types */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Booking trends bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="bar_chart" size={18} className="text-primary" />
              {t('analytics.bookingTrends')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={{ stroke: '#DADCE0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    cursor={{ fill: '#F1F3F4' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }}
                    formatter={(v: number) => [v, t('analytics.bookings')]}
                  />
                  <Bar dataKey="bookings" fill="#1A73E8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Visit types pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="pie_chart" size={18} className="text-primary" />
              {t('analytics.visitTypes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}>
                        {pieData.map((_: any, i: number) => <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2">
                  {pieData.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="size-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">{t('analytics.noData')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top services by revenue */}
      {data.topServices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="workspace_premium" size={18} className="text-primary" />
              {t('analytics.topServices')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topServices.map((s: any, i: number) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-secondary text-xs font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                    <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{formatCurrency(String(s.revenue), 'USD', locale)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(s.revenue / data.topServices[0].revenue) * 100}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{s.count} {s.count === 1 ? 'booking' : 'bookings'}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AnalyticsStatCard({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: 'primary' | 'success' | 'warning' | 'info' }) {
  const toneCls = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
  }[tone]
  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-[14px] transition-transform group-hover:scale-105', toneCls)}>
          <Icon name={icon} size={24} fill />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
