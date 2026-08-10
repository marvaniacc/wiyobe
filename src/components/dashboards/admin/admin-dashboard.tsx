'use client'

import * as React from 'react'
import { Icon } from '@/components/shared/icon'
import { MessagesSection } from '@/components/chat/messages-section'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost, apiPut } from '@/hooks/use-api'
import { TicketsSection } from '@/components/shared/tickets-section'
import { useApp } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatCurrency, formatDate, formatDateTime, relativeTime } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell,
} from 'recharts'

// ============================================================================
// Types
// ============================================================================

type Status = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED' | 'NO_SHOW'
type Role = 'PATIENT' | 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR' | 'ADMIN'
type ProviderType = 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
type LedgerType =
  | 'PATIENT_CHARGE' | 'COMMISSION' | 'PROVIDER_CREDIT' | 'PROVIDER_DEBIT'
  | 'REFUND_PATIENT' | 'REFUND_COMMISSION_REVERSAL' | 'REFUND_PROVIDER_DEBIT' | 'PAYOUT'

interface AdminUser {
  id: string
  email: string
  role: Role
  status: Status
  name: string | null
  preferredLanguage: string
  country: string | null
  city: string | null
  createdAt: string
  doctor?: { specialty: string; verified: boolean; city: string; country: string } | null
  hospital?: { name: string; verified: boolean; city: string; country: string } | null
  hotel?: { name: string; verified: boolean; city: string; country: string } | null
  translator?: { specialization: string; verified: boolean; city: string; country: string } | null
  patient?: { dateOfBirth: string | null } | null
}

interface AdminStats {
  totalBookings: number
  completedBookings: number
  activeProviders: number
  totalUsers: number
  platformRevenue: string
  pendingProviders: number
  recentBookings: Array<{
    id: string
    providerType: ProviderType
    visitType: 'IN_PERSON' | 'ONLINE'
    status: Status
    startDate: string
    amount: string
    patient: { name: string | null }
  }>
  byType: Array<{ providerType: ProviderType; _count: number }>
  dailyRevenue: Array<{ date: string; amount: number }>
}

interface CommissionRate { id: string; providerType: ProviderType; rate: string; affiliateRate: string }
interface CancellationPolicy {
  id: string
  providerType: ProviderType
  freeCancellationHours: number
  cancellationFeePercent: string
}

interface ProviderBalanceRow {
  userId: string
  name: string | null
  email: string
  providerType: ProviderType
  available: string
  pending: string
  paidOut: string
  lifetime: string
}

interface Payout {
  id: string
  providerUserId: string
  providerType: ProviderType
  amount: string
  status: 'PENDING' | 'COMPLETED'
  method: string
  reference: string | null
  periodStart: string
  periodEnd: string
  completedAt: string | null
  createdAt: string
  providerUser: { name: string | null; email: string }
}

interface LedgerEntry {
  id: string
  type: LedgerType
  bookingId: string | null
  paymentId: string | null
  payoutId: string | null
  userId: string | null
  amount: string
  description: string
  createdAt: string
  booking?: { id: string; patient: { name: string | null } | null } | null
  user?: { name: string | null; email: string } | null
}

// ============================================================================
// Shared helpers
// ============================================================================

const ROLE_LABEL_KEY: Record<Role, string> = {
  PATIENT: 'role.patient',
  DOCTOR: 'role.doctor',
  HOSPITAL: 'role.hospital',
  HOTEL: 'role.hotel',
  TRANSLATOR: 'role.translator',
  ADMIN: 'role.admin',
}

const PROVIDER_TYPE_LABEL_KEY: Record<ProviderType, string> = {
  DOCTOR: 'role.doctor',
  HOSPITAL: 'role.hospital',
  HOTEL: 'role.hotel',
  TRANSLATOR: 'role.translator',
}

function exportCSV(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (val: string | number | null | undefined) => {
    const s = String(val ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function StatusBadge({ status }: { status: Status }) {
  const { t } = useT()
  const map: Record<string, { labelKey: string; cls: string }> = {
    ACTIVE: { labelKey: 'common.active', cls: 'bg-success/10 text-success border border-success/20' },
    PENDING: { labelKey: 'common.pending', cls: 'bg-warning text-warning-foreground' },
    SUSPENDED: { labelKey: 'common.suspended', cls: 'bg-error/10 text-error border border-error/20' },
    CONFIRMED: { labelKey: 'common.active', cls: 'bg-primary/10 text-primary border border-primary/20' },
    COMPLETED: { labelKey: 'common.completed', cls: 'bg-success/10 text-success border border-success/20' },
    CANCELLED: { labelKey: 'common.cancelled', cls: 'bg-error/10 text-error border border-error/20' },
    REFUNDED: { labelKey: 'common.cancelled', cls: 'bg-error/10 text-error border border-error/20' },
    NO_SHOW: { labelKey: 'common.cancelled', cls: 'bg-warning text-warning-foreground' },
  }
  const cfg = map[status] || map.ACTIVE
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.cls)}>
      {t(cfg.labelKey)}
    </span>
  )
}

function RoleBadge({ role }: { role: Role }) {
  const { t } = useT()
  const map: Record<Role, string> = {
    PATIENT: 'bg-info/10 text-info border-info/20',
    DOCTOR: 'bg-primary/10 text-primary border-primary/20',
    HOSPITAL: 'bg-primary/10 text-primary border-primary/20',
    HOTEL: 'bg-primary/10 text-primary border-primary/20',
    TRANSLATOR: 'bg-primary/10 text-primary border-primary/20',
    ADMIN: 'bg-foreground/10 text-foreground border-divider',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', map[role])}>
      {t(ROLE_LABEL_KEY[role])}
    </span>
  )
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useT()
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <Icon name="check_circle" size={14} fill /> {t('common.verified')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Icon name="pending" size={14} /> {t('common.pending')}
    </span>
  )
}

function LedgerTypeBadge({ type }: { type: LedgerType }) {
  const map: Record<LedgerType, string> = {
    PATIENT_CHARGE: 'bg-success/10 text-success border border-success/20',
    COMMISSION: 'bg-primary/10 text-primary border border-primary/20',
    PROVIDER_CREDIT: 'bg-info/10 text-info border border-info/20',
    PROVIDER_DEBIT: 'bg-warning text-warning-foreground',
    REFUND_PATIENT: 'bg-error/10 text-error border border-error/20',
    REFUND_COMMISSION_REVERSAL: 'bg-error/10 text-error border border-error/20',
    REFUND_PROVIDER_DEBIT: 'bg-error/10 text-error border border-error/20',
    PAYOUT: 'bg-warning text-warning-foreground',
  }
  const label = type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap', map[type])}>
      {label}
    </span>
  )
}

function getProviderProfile(u: AdminUser) {
  if (u.doctor) return { type: 'DOCTOR' as ProviderType, label: u.doctor.specialty, verified: u.doctor.verified, city: u.doctor.city, country: u.doctor.country, name: u.name }
  if (u.hospital) return { type: 'HOSPITAL' as ProviderType, label: u.hospital.name, verified: u.hospital.verified, city: u.hospital.city, country: u.hospital.country, name: u.hospital.name }
  if (u.hotel) return { type: 'HOTEL' as ProviderType, label: u.hotel.name, verified: u.hotel.verified, city: u.hotel.city, country: u.hotel.country, name: u.hotel.name }
  if (u.translator) return { type: 'TRANSLATOR' as ProviderType, label: u.translator.specialization, verified: u.translator.verified, city: u.translator.city, country: u.translator.country, name: u.name }
  return null
}

// ============================================================================
// Layout primitives
// ============================================================================

function PageHeader({ title, description, icon, action }: { title: string; description?: string; icon: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
          <Icon name={icon} size={24} fill />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT()
  return (
    <Card className="py-8">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
          <Icon name="error" size={26} fill />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
            <Icon name="refresh" size={16} /> {t('admin.retry')}
          </Button>
        )}
      </CardContent>
    </Card>
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
          <Skeleton key={`item-${i}`} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Card className="gap-0">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-[20px] bg-surface-secondary text-muted-foreground">
          <Icon name={icon} size={32} />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">{title}</p>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}

function StatCard({ icon, label, value, tone = 'primary', subtitle }: { icon: string; label: string; value: string; tone?: 'primary' | 'success' | 'warning' | 'info'; subtitle?: string }) {
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
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Overview section
// ============================================================================

function OverviewSection() {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const { data, loading, error, refetch } = useApi<AdminStats>('/api/stats')

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.overviewTitle')} icon="space_dashboard" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`item-${i}`} className="py-5"><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <LoadingCard lines={4} />
          <LoadingCard lines={4} />
          <LoadingCard lines={4} />
        </div>
      </div>
    )
  }

  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  const byTypeMap: Record<ProviderType, number> = { DOCTOR: 0, HOSPITAL: 0, HOTEL: 0, TRANSLATOR: 0 }
  data.byType.forEach((b) => { byTypeMap[b.providerType as ProviderType] = b._count })

  const chartData = data.dailyRevenue.map((d) => ({
    date: formatDate(d.date, locale, { month: 'short', day: 'numeric' }),
    amount: Number(d.amount),
  }))

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('admin.overviewTitle')} icon="space_dashboard" />

      {data.pendingProviders > 0 && (
        <Card key="pending-alert" className="mb-6 border-warning/30 bg-warning/5 py-4">
          <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-warning text-warning-foreground">
                <Icon name="schedule" size={22} fill />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {data.pendingProviders} {t('admin.pendingProvidersAlert')}
                </p>
                <p className="text-xs text-muted-foreground">{t('admin.moderationDesc')}</p>
              </div>
            </div>
            <Button size="sm" variant="default" onClick={() => goDashboard('moderation')} className="gap-1.5">
              <Icon name="manage_accounts" size={16} fill /> {t('admin.reviewNow')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard icon="payments" label={t('admin.platformRevenue')} value={formatCurrency(data.platformRevenue, 'USD', locale)} tone="success" />
        <StatCard icon="event" label={t('admin.totalBookings')} value={String(data.totalBookings)} tone="primary" />
        <StatCard icon="check_circle" label={t('admin.completedVisits')} value={String(data.completedBookings)} tone="info" />
        <StatCard icon="verified" label={t('admin.activeProviders')} value={String(data.activeProviders)} tone="primary" />
        <StatCard icon="group" label={t('admin.totalUsers')} value={String(data.totalUsers)} tone="info" />
      </div>

      {/* Chart + by type */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('admin.revenueLast7')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={{ stroke: '#DADCE0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v) => formatCurrency(String(v), 'USD', locale).replace(/\.\d+$/, '')} />
                  <Tooltip
                    cursor={{ fill: '#F1F3F4' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }}
                    formatter={(v: number) => [formatCurrency(String(v), 'USD', locale), t('admin.platformRevenue')]}
                  />
                  <Bar dataKey="amount" fill="#1A73E8" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('admin.byProviderType')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(Object.keys(byTypeMap) as ProviderType[]).map((pt) => (
              <div key={pt} className="flex items-center justify-between rounded-[12px] border border-divider bg-surface-secondary/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                    <Icon name={pt === 'DOCTOR' ? 'medical_services' : pt === 'HOSPITAL' ? 'local_hospital' : pt === 'HOTEL' ? 'hotel' : 'translate'} size={20} fill />
                  </div>
                  <span className="text-sm font-medium text-foreground">{t(PROVIDER_TYPE_LABEL_KEY[pt])}</span>
                </div>
                <span className="text-lg font-semibold text-foreground">{byTypeMap[pt]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent bookings */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{t('admin.recentBookings')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-6 text-xs uppercase tracking-wide text-muted-foreground">{t('admin.user')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.role')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.date')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.status')}</TableHead>
                <TableHead className="pe-6 text-end text-xs uppercase tracking-wide text-muted-foreground">{t('common.amount')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentBookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{t('admin.noData')}</TableCell>
                </TableRow>
              )}
              {data.recentBookings.map((b) => (
                <TableRow key={b.id} className="h-14">
                  <TableCell className="ps-6 font-medium text-foreground">{b.patient.name || '—'}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Icon name={b.providerType === 'DOCTOR' ? 'medical_services' : b.providerType === 'HOSPITAL' ? 'local_hospital' : b.providerType === 'HOTEL' ? 'hotel' : 'translate'} size={16} />
                      {t(PROVIDER_TYPE_LABEL_KEY[b.providerType])}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(b.startDate, locale)}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell className="pe-6 text-end font-semibold text-foreground">{formatCurrency(b.amount, 'USD', locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Users action hook (shared by providers/users/moderation)
// ============================================================================

function useUserAction(onSuccess?: () => void) {
  const { t } = useT()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const run = React.useCallback(async (userId: string, action: 'approve' | 'suspend' | 'activate' | 'reject') => {
    setBusyId(userId)
    try {
      await apiPost('/api/admin/users', { userId, action })
      toast.success(t('admin.userUpdated'))
      onSuccess?.()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setBusyId(null)
    }
  }, [onSuccess, t])
  return { busyId, run }
}

// ============================================================================
// Providers section
// ============================================================================

function ProvidersSection() {
  const { t, locale } = useT()
  const [search, setSearch] = React.useState('')
  const { data, loading, error, refetch } = useApi<{ users: AdminUser[] }>('/api/admin/users')
  const { busyId, run } = useUserAction(refetch)

  const providers = React.useMemo(() => {
    if (!data?.users) return []
    const q = search.trim().toLowerCase()
    return data.users
      .filter((u) => ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'].includes(u.role))
      .filter((u) => u.status === 'ACTIVE')
      .filter((u) => !q || (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [data, search])

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.providersTitle')} icon="verified" />
        <LoadingCard lines={6} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.providersTitle')}
        description={t('admin.providersDesc')}
        icon="verified"
        action={
          <div className="relative w-full sm:w-72">
            <Icon name="search" size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.searchUsers')} className="h-10 ps-10" />
          </div>
        }
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-6 text-xs uppercase tracking-wide text-muted-foreground">{t('admin.name')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.role')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.specialty')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.location')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.verified')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.joined')}</TableHead>
              <TableHead className="pe-6 text-end text-xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">{t('admin.noData')}</TableCell>
              </TableRow>
            )}
            {providers.map((u) => {
              const p = getProviderProfile(u)
              return (
                <TableRow key={u.id} className="h-16">
                  <TableCell className="ps-6">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{p?.name || u.name || '—'}</span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </div>
                  </TableCell>
                  <TableCell><RoleBadge role={u.role} /></TableCell>
                  <TableCell className="text-sm text-foreground">{p?.label || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.city || p?.city ? [u.city || p?.city, u.country || p?.country].filter(Boolean).join(', ') : '—'}
                  </TableCell>
                  <TableCell>{p ? <VerifiedBadge verified={p.verified} /> : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(u.createdAt, locale)}</TableCell>
                  <TableCell className="pe-6 text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(u.id, 'suspend')}
                      disabled={busyId === u.id}
                      className="gap-1.5 text-error hover:bg-error/5 hover:text-error"
                    >
                      <Icon name="block" size={14} /> {t('admin.suspend')}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ============================================================================
// Users section
// ============================================================================

function UsersSection() {
  const { t, locale } = useT()
  const [search, setSearch] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<string>('all')
  const { data, loading, error, refetch } = useApi<{ users: AdminUser[] }>('/api/admin/users')
  const { busyId, run } = useUserAction(refetch)

  const users = React.useMemo(() => {
    if (!data?.users) return []
    const q = search.trim().toLowerCase()
    return data.users
      .filter((u) => roleFilter === 'all' || u.role === roleFilter)
      .filter((u) => !q || (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [data, search, roleFilter])

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.usersTitle')} icon="group" />
        <LoadingCard lines={6} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.usersTitle')}
        description={t('admin.usersDesc')}
        icon="group"
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Icon name="search" size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.searchUsers')} className="h-10 ps-10" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-10 w-full sm:w-44 rounded-[14px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('admin.allRoles')}</SelectItem>
                <SelectItem value="PATIENT">{t('role.patient')}</SelectItem>
                <SelectItem value="DOCTOR">{t('role.doctor')}</SelectItem>
                <SelectItem value="HOSPITAL">{t('role.hospital')}</SelectItem>
                <SelectItem value="HOTEL">{t('role.hotel')}</SelectItem>
                <SelectItem value="TRANSLATOR">{t('role.translator')}</SelectItem>
                <SelectItem value="ADMIN">{t('role.admin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-6 text-xs uppercase tracking-wide text-muted-foreground">{t('admin.name')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.role')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.status')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.location')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.joined')}</TableHead>
              <TableHead className="pe-6 text-end text-xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{t('admin.noData')}</TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id} className="h-16">
                <TableCell className="ps-6">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{u.name || '—'}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </div>
                </TableCell>
                <TableCell><RoleBadge role={u.role} /></TableCell>
                <TableCell><StatusBadge status={u.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[u.city, u.country].filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(u.createdAt, locale)}</TableCell>
                <TableCell className="pe-6 text-end">
                  {u.role === 'ADMIN' ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : u.status === 'SUSPENDED' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(u.id, 'activate')}
                      disabled={busyId === u.id}
                      className="gap-1.5 text-success hover:bg-success/5 hover:text-success"
                    >
                      <Icon name="check_circle" size={14} /> {t('admin.activate')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(u.id, 'suspend')}
                      disabled={busyId === u.id}
                      className="gap-1.5 text-error hover:bg-error/5 hover:text-error"
                    >
                      <Icon name="block" size={14} /> {t('admin.suspend')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ============================================================================
// Moderation section
// ============================================================================

function ModerationSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ users: AdminUser[] }>('/api/admin/users')
  const { busyId, run } = useUserAction(refetch)

  const pending = React.useMemo(() => {
    if (!data?.users) return []
    return data.users.filter((u) => u.status === 'PENDING')
  }, [data])

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.moderationTitle')} icon="manage_accounts" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LoadingCard lines={3} />
          <LoadingCard lines={3} />
        </div>
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.moderationTitle')}
        description={t('admin.moderationDesc')}
        icon="manage_accounts"
        action={
          pending.length > 0 ? (
            <Badge className="rounded-full bg-warning text-warning-foreground px-3 py-1 text-xs">
              {pending.length} {t('admin.pendingCount')}
            </Badge>
          ) : undefined
        }
      />

      {pending.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
              <Icon name="check_circle" size={32} fill />
            </div>
            <p className="text-sm font-medium text-foreground">{t('admin.noPending')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pending.map((u) => {
            const p = getProviderProfile(u)
            return (
              <Card key={u.id} className="gap-0">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Icon name={u.role === 'DOCTOR' ? 'medical_services' : u.role === 'HOSPITAL' ? 'local_hospital' : u.role === 'HOTEL' ? 'hotel' : 'translate'} size={24} fill />
                      </div>
                      <div>
                        <CardTitle className="text-base">{p?.name || u.name || '—'}</CardTitle>
                        <CardDescription className="text-xs">{u.email}</CardDescription>
                      </div>
                    </div>
                    <RoleBadge role={u.role} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {p?.label && (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.specialty')}</p>
                        <p className="font-medium text-foreground">{p.label}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.location')}</p>
                      <p className="font-medium text-foreground">{[u.city || p?.city, u.country || p?.country].filter(Boolean).join(', ') || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.submittedOn')}</p>
                      <p className="font-medium text-foreground">{formatDate(u.createdAt, locale)} · {relativeTime(u.createdAt, locale)}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(u.id, 'reject')}
                      disabled={busyId === u.id}
                      className="gap-1.5 text-error hover:bg-error/5 hover:text-error"
                    >
                      <Icon name="block" size={14} /> {t('admin.reject')}
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => run(u.id, 'approve')}
                      disabled={busyId === u.id}
                      className="gap-1.5"
                    >
                      <Icon name="check_circle" size={14} fill /> {t('admin.approve')}
                    </Button>
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

// ============================================================================
// Commission section
// ============================================================================

function CommissionSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ rates: CommissionRate[] }>('/api/admin/commission')
  const [rates, setRates] = React.useState<Record<ProviderType, string>>({ DOCTOR: '', HOSPITAL: '', HOTEL: '', TRANSLATOR: '' })
  const [affRates, setAffRates] = React.useState<Record<ProviderType, string>>({ DOCTOR: '', HOSPITAL: '', HOTEL: '', TRANSLATOR: '' })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (data?.rates) {
      const map: Record<ProviderType, string> = { DOCTOR: '', HOSPITAL: '', HOTEL: '', TRANSLATOR: '' }
      const affMap: Record<ProviderType, string> = { DOCTOR: '', HOSPITAL: '', HOTEL: '', TRANSLATOR: '' }
      data.rates.forEach((r) => { map[r.providerType] = r.rate; affMap[r.providerType] = r.affiliateRate })
      setRates(map)
      setAffRates(affMap)
    }
  }, [data])

  async function save() {
    setSaving(true)
    try {
      const payload = { rates: (Object.keys(rates) as ProviderType[]).map((pt) => ({ providerType: pt, rate: rates[pt] || '0', affiliateRate: affRates[pt] || '0' })) }
      await apiPut('/api/admin/commission', payload)
      toast.success(t('admin.commissionUpdated'))
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.commissionTitle')} icon="percent" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  const types: ProviderType[] = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
  const iconFor = (pt: ProviderType) => pt === 'DOCTOR' ? 'medical_services' : pt === 'HOSPITAL' ? 'local_hospital' : pt === 'HOTEL' ? 'hotel' : 'translate'

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('admin.commissionTitle')} description={t('admin.commissionDesc')} icon="percent" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('admin.commissionTitle')}</CardTitle>
            <CardDescription>{t('admin.commissionDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Header row */}
            <div className="hidden grid-cols-[1fr_120px_120px_60px] items-center gap-3 px-1 sm:grid">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider type</span>
              <span className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform %</span>
              <span className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Affiliate %</span>
              <span className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</span>
            </div>

            {types.map((pt) => {
              const platform = parseFloat(rates[pt]) || 0
              const affiliate = parseFloat(affRates[pt]) || 0
              const total = platform + affiliate
              return (
                <div key={pt} className="grid grid-cols-1 items-center gap-3 rounded-[14px] border border-divider bg-surface-secondary/40 p-4 sm:grid-cols-[1fr_120px_120px_60px]">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                      <Icon name={iconFor(pt)} size={22} fill />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t(PROVIDER_TYPE_LABEL_KEY[pt])}</p>
                      <p className="text-xs text-muted-foreground">Total: {total}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" min="0" max="100" step="0.5"
                      value={rates[pt]}
                      onChange={(e) => setRates((s) => ({ ...s, [pt]: e.target.value }))}
                      className="h-10 text-end"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" min="0" max="100" step="0.5"
                      value={affRates[pt]}
                      onChange={(e) => setAffRates((s) => ({ ...s, [pt]: e.target.value }))}
                      className="h-10 text-end"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="text-center">
                    <span className="text-lg font-bold text-foreground tabular-nums">{total}%</span>
                  </div>
                </div>
              )
            })}
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving} className="gap-1.5">
                <Icon name="save" size={16} /> {t('admin.saveRates')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info card explaining the commission system */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="info" size={18} className="text-primary" />
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>Platform % goes to the platform from each booking.</span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>Affiliate % goes to the affiliate who referred the patient or provider.</span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>If no affiliate referred the user, the affiliate share goes to the platform.</span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>Total % is deducted from the booking amount; the provider receives the rest.</span>
            </div>
            <Separator className="my-2" />
            <div className="rounded-[12px] bg-surface-secondary p-3">
              <p className="text-xs font-medium text-foreground">Example</p>
              <p className="mt-1 text-xs">Booking: $100, Platform: 12%, Affiliate: 3%</p>
              <p className="text-xs">Platform gets: $12 · Affiliate gets: $3</p>
              <p className="text-xs">Provider receives: $85</p>
              <p className="mt-1 text-xs text-muted-foreground">If no affiliate: Platform gets $15, Provider gets $85</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Cancellations section
// ============================================================================

function CancellationsSection() {
  const { t, locale } = useT()
  const { data: polData, loading: polLoading, error: polError, refetch: polRefetch } = useApi<{ policies: CancellationPolicy[] }>('/api/admin/cancellation')
  const { data: bkData, loading: bkLoading, error: bkError, refetch: bkRefetch } = useApi<{ bookings: any[] }>('/api/bookings?status=CANCELLED')

  const [policies, setPolicies] = React.useState<Record<ProviderType, { hours: string; fee: string }>>({
    DOCTOR: { hours: '24', fee: '20' },
    HOSPITAL: { hours: '24', fee: '20' },
    HOTEL: { hours: '24', fee: '10' },
    TRANSLATOR: { hours: '24', fee: '20' },
  })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (polData?.policies) {
      const map: Record<ProviderType, { hours: string; fee: string }> = { DOCTOR: { hours: '24', fee: '20' }, HOSPITAL: { hours: '24', fee: '20' }, HOTEL: { hours: '24', fee: '10' }, TRANSLATOR: { hours: '24', fee: '20' } }
      polData.policies.forEach((p) => {
        map[p.providerType] = { hours: String(p.freeCancellationHours), fee: p.cancellationFeePercent }
      })
      setPolicies(map)
    }
  }, [polData])

  async function save() {
    setSaving(true)
    try {
      const payload = { policies: (Object.keys(policies) as ProviderType[]).map((pt) => ({ providerType: pt, freeCancellationHours: parseInt(policies[pt].hours || '0', 10), cancellationFeePercent: policies[pt].fee || '0' })) }
      await apiPut('/api/admin/cancellation', payload)
      toast.success(t('admin.policiesUpdated'))
      polRefetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  if (polLoading) {
    return (
      <div>
        <PageHeader title={t('dash.cancellations')} icon="cancel_schedule_send" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (polError || !polData) return <ErrorState message={polError || t('admin.error')} onRetry={polRefetch} />

  const types: ProviderType[] = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
  const iconFor = (pt: ProviderType) => pt === 'DOCTOR' ? 'medical_services' : pt === 'HOSPITAL' ? 'local_hospital' : pt === 'HOTEL' ? 'hotel' : 'translate'

  const cancelled = bkData?.bookings || []

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('dash.cancellations')} icon="cancel_schedule_send" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dash.cancellations')}</CardTitle>
            <CardDescription>{t('admin.policiesUpdated')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {types.map((pt) => (
              <div key={pt} className="rounded-[14px] border border-divider bg-surface-secondary/40 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                    <Icon name={iconFor(pt)} size={20} fill />
                  </div>
                  <span className="text-sm font-medium text-foreground">{t(PROVIDER_TYPE_LABEL_KEY[pt])}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 text-xs text-muted-foreground">{t('admin.freeCancellationHours')}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={policies[pt].hours}
                      onChange={(e) => setPolicies((s) => ({ ...s, [pt]: { ...s[pt], hours: e.target.value } }))}
                      className="h-10"
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 text-xs text-muted-foreground">{t('admin.cancellationFeePercent')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={policies[pt].fee}
                        onChange={(e) => setPolicies((s) => ({ ...s, [pt]: { ...s[pt], fee: e.target.value } }))}
                        className="h-10"
                      />
                      <span className="text-sm font-medium text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-1">
              <Button onClick={save} disabled={saving} className="gap-1.5">
                <Icon name="save" size={16} /> {t('admin.savePolicies')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardHeader className="pt-6">
            <CardTitle className="text-base">{t('admin.cancelledBookings')}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {bkLoading ? (
              <div className="flex flex-col gap-2 px-6 pb-6">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`item-${i}`} className="h-14 w-full" />)}
              </div>
            ) : bkError ? (
              <div className="px-6 pb-6"><ErrorState message={bkError} onRetry={bkRefetch} /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-6 text-xs uppercase tracking-wide text-muted-foreground">{t('admin.user')}</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.amount')}</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.refundAmount')}</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.feeRetained')}</TableHead>
                    <TableHead className="pe-6 text-xs uppercase tracking-wide text-muted-foreground">{t('admin.cancelledOn')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cancelled.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">{t('admin.noData')}</TableCell>
                    </TableRow>
                  )}
                  {cancelled.map((b) => {
                    const refund = b.refundAmount ? parseFloat(b.refundAmount) : 0
                    const amt = parseFloat(b.amount || '0')
                    const fee = Math.max(0, amt - refund)
                    return (
                      <TableRow key={b.id} className="h-14">
                        <TableCell className="ps-6">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{b.patient?.name || '—'}</span>
                            <span className="text-xs text-muted-foreground">{t(PROVIDER_TYPE_LABEL_KEY[b.providerType as ProviderType])}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">{formatCurrency(b.amount || '0', 'USD', locale)}</TableCell>
                        <TableCell className="text-sm text-success">{formatCurrency(String(refund), 'USD', locale)}</TableCell>
                        <TableCell className="text-sm text-error">{formatCurrency(String(fee), 'USD', locale)}</TableCell>
                        <TableCell className="pe-6 text-sm text-muted-foreground">{b.cancelledAt ? formatDate(b.cancelledAt, locale) : '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Payouts section
// ============================================================================

function PayoutsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ providers: ProviderBalanceRow[]; payouts: Payout[] }>('/api/payouts')
  const [running, setRunning] = React.useState(false)
  const [payDialog, setPayDialog] = React.useState<Payout | null>(null)
  const [reference, setReference] = React.useState('')
  const [paying, setPaying] = React.useState(false)

  async function runSettlement() {
    setRunning(true)
    try {
      const res = await apiPost<{ created: any[]; count: number }>('/api/payouts/run')
      if (res.count > 0) {
        toast.success(`${t('admin.settlementCreated')} — ${res.count} ${t('admin.payoutsCreated')}`)
      } else {
        toast.info(t('admin.noPayoutsCreated'))
      }
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setRunning(false)
    }
  }

  async function markPaid() {
    if (!payDialog) return
    setPaying(true)
    try {
      await apiPost('/api/payouts/pay', { payoutId: payDialog.id, reference: reference || undefined })
      toast.success(t('admin.markPaidSuccess'))
      setPayDialog(null)
      setReference('')
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setPaying(false)
    }
  }

  function exportPayoutsCsv() {
    if (!data?.payouts) return
    exportCSV(
      `payouts-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Provider', 'Email', 'Type', 'Amount', 'Status', 'Method', 'Reference'],
      data.payouts.map((p) => [
        new Date(p.createdAt).toISOString(),
        p.providerUser?.name || '',
        p.providerUser?.email || '',
        p.providerType,
        p.amount,
        p.status,
        p.method,
        p.reference || '',
      ])
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.payoutsTitle')} icon="account_balance" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.payoutsTitle')}
        description={t('admin.payoutsDesc')}
        icon="account_balance"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportPayoutsCsv} className="gap-1.5">
              <Icon name="download" size={16} /> {t('admin.exportCsv')}
            </Button>
            <Button size="sm" onClick={runSettlement} disabled={running} className="gap-1.5">
              <Icon name="payments" size={16} fill /> {t('admin.runSettlement')}
            </Button>
          </div>
        }
      />

      {/* Provider balances */}
      <Card className="mb-4 py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">{t('admin.providerBalances')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-6 text-xs uppercase tracking-wide text-muted-foreground">{t('admin.name')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.role')}</TableHead>
                <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">{t('admin.available')}</TableHead>
                <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">{t('admin.pendingFunds')}</TableHead>
                <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">{t('admin.paidOut')}</TableHead>
                <TableHead className="pe-6 text-end text-xs uppercase tracking-wide text-muted-foreground">{t('admin.lifetime')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.providers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{t('admin.noData')}</TableCell>
                </TableRow>
              )}
              {data.providers.map((p) => (
                <TableRow key={p.userId} className="h-14">
                  <TableCell className="ps-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{p.name || '—'}</span>
                      <span className="text-xs text-muted-foreground">{p.email}</span>
                    </div>
                  </TableCell>
                  <TableCell><RoleBadge role={p.providerType as Role} /></TableCell>
                  <TableCell className="text-end text-sm font-semibold text-success">{formatCurrency(p.available, 'USD', locale)}</TableCell>
                  <TableCell className="text-end text-sm text-warning">{formatCurrency(p.pending, 'USD', locale)}</TableCell>
                  <TableCell className="text-end text-sm text-muted-foreground">{formatCurrency(p.paidOut, 'USD', locale)}</TableCell>
                  <TableCell className="pe-6 text-end text-sm font-medium text-foreground">{formatCurrency(p.lifetime, 'USD', locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payout history */}
      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle className="text-base">{t('admin.payoutHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-6 text-xs uppercase tracking-wide text-muted-foreground">{t('admin.createdOn')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.name')}</TableHead>
                <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">{t('common.amount')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.status')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.method')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.reference')}</TableHead>
                <TableHead className="pe-6 text-end text-xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payouts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">{t('admin.noData')}</TableCell>
                </TableRow>
              )}
              {data.payouts.map((p) => (
                <TableRow key={p.id} className="h-14">
                  <TableCell className="ps-6 text-sm text-muted-foreground">{formatDate(p.createdAt, locale)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{p.providerUser?.name || '—'}</span>
                      <span className="text-xs text-muted-foreground">{p.providerUser?.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-end text-sm font-semibold text-foreground">{formatCurrency(p.amount, 'USD', locale)}</TableCell>
                  <TableCell>
                    {p.status === 'COMPLETED' ? (
                      <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                        {t('common.completed')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-warning px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
                        {t('common.pending')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.method}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.reference || '—'}</TableCell>
                  <TableCell className="pe-6 text-end">
                    {p.status === 'PENDING' && (
                      <Button size="sm" variant="outline" onClick={() => { setPayDialog(p); setReference('') }} className="gap-1.5">
                        <Icon name="check_circle" size={14} /> {t('admin.markPaid')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mark as paid dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.markPaid')}</DialogTitle>
            <DialogDescription>{t('admin.confirmMarkPaid')}</DialogDescription>
          </DialogHeader>
          {payDialog && (
            <div className="flex flex-col gap-3">
              <div className="rounded-[14px] bg-surface-secondary/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('admin.name')}</span>
                  <span className="font-medium text-foreground">{payDialog.providerUser?.name || '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('common.amount')}</span>
                  <span className="font-semibold text-foreground">{formatCurrency(payDialog.amount, 'USD', locale)}</span>
                </div>
              </div>
              <div>
                <Label className="mb-1.5">{t('admin.reference')}</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('admin.referencePlaceholder')} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>{t('common.cancel')}</Button>
            <Button variant="success" onClick={markPaid} disabled={paying} className="gap-1.5">
              <Icon name="check_circle" size={16} fill /> {t('admin.markPaid')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Ledger section
// ============================================================================

const LEDGER_TYPES: LedgerType[] = [
  'PATIENT_CHARGE', 'COMMISSION', 'AFFILIATE_COMMISSION', 'PROVIDER_CREDIT', 'PROVIDER_DEBIT',
  'REFUND_PATIENT', 'REFUND_COMMISSION_REVERSAL', 'REFUND_PROVIDER_DEBIT', 'PAYOUT',
]
const PAGE_SIZE = 25

function LedgerSection() {
  const { t, locale } = useT()
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(0)
  const { data, loading, error, refetch } = useApi<{ entries: LedgerEntry[] }>('/api/ledger')

  const filtered = React.useMemo(() => {
    if (!data?.entries) return []
    const q = search.trim().toLowerCase()
    return data.entries
      .filter((e) => typeFilter === 'all' || e.type === typeFilter)
      .filter((e) => !q || e.description.toLowerCase().includes(q) || (e.user?.email || '').toLowerCase().includes(q))
  }, [data, typeFilter, search])

  const summary = React.useMemo(() => {
    let credits = 0, debits = 0
    filtered.forEach((e) => {
      const amt = parseFloat(e.amount)
      if (amt >= 0) credits += amt
      else debits += Math.abs(amt)
    })
    return { credits, debits, net: credits - debits }
  }, [filtered])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  React.useEffect(() => { setPage(0) }, [typeFilter, search])

  function exportCsv() {
    if (!filtered.length) return
    exportCSV(
      `ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Type', 'Description', 'Amount', 'Booking ID', 'User'],
      filtered.map((e) => [
        new Date(e.createdAt).toISOString(),
        e.type,
        e.description,
        e.amount,
        e.bookingId || '',
        e.user?.email || '',
      ])
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.ledgerTitle')} icon="receipt_long" />
        <LoadingCard lines={8} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.ledgerTitle')}
        description={t('admin.ledgerDesc')}
        icon="receipt_long"
        action={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} className="gap-1.5">
            <Icon name="download" size={16} /> {t('admin.exportCsv')}
          </Button>
        }
      />

      {/* Summary */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="py-4">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-success/10 text-success">
              <Icon name="trending_up" size={22} fill />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.totalCredits')}</p>
              <p className="text-lg font-semibold text-success">{formatCurrency(summary.credits.toFixed(2), 'USD', locale)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-error/10 text-error">
              <Icon name="trending_down" size={22} fill />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.totalDebits')}</p>
              <p className="text-lg font-semibold text-error">{formatCurrency(summary.debits.toFixed(2), 'USD', locale)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
              <Icon name="analytics" size={22} fill />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.net')}</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(summary.net.toFixed(2), 'USD', locale)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4 py-4">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Icon name="search" size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.description')} className="h-10 ps-10" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-10 w-full rounded-[14px] sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('admin.allTypes')}</SelectItem>
              {LEDGER_TYPES.map((lt) => (
                <SelectItem key={lt} value={lt}>{lt.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-6 text-xs uppercase tracking-wide text-muted-foreground">{t('common.date')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.type')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.description')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.relatedBooking')}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.user')}</TableHead>
              <TableHead className="pe-6 text-end text-xs uppercase tracking-wide text-muted-foreground">{t('common.amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{t('admin.noData')}</TableCell>
              </TableRow>
            )}
            {pageRows.map((e) => {
              const amt = parseFloat(e.amount)
              const positive = amt >= 0
              return (
                <TableRow key={e.id} className="h-14">
                  <TableCell className="ps-6 text-sm text-muted-foreground">{formatDateTime(e.createdAt, locale)}</TableCell>
                  <TableCell><LedgerTypeBadge type={e.type} /></TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm text-foreground" title={e.description}>{e.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.bookingId ? e.bookingId.slice(-6) : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.user?.email || '—'}</TableCell>
                  <TableCell className={cn('pe-6 text-end text-sm font-semibold', positive ? 'text-success' : 'text-error')}>
                    {positive ? '+' : '−'}{formatCurrency(Math.abs(amt).toFixed(2), 'USD', locale)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-divider px-6 py-3">
            <p className="text-xs text-muted-foreground">
              {t('admin.showing')} {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} {t('admin.of')} {filtered.length} {t('admin.totalEntries')}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="gap-1">
                <Icon name="chevron_left" size={16} className="rtl:rotate-180" /> {t('admin.prev')}
              </Button>
              <span className="text-xs text-muted-foreground">{page + 1} / {pageCount}</span>
              <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="gap-1">
                {t('admin.next')} <Icon name="chevron_right" size={16} className="rtl:rotate-180" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ============================================================================
// Reports section
// ============================================================================

function ReportsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ entries: LedgerEntry[] }>('/api/ledger')

  const report = React.useMemo(() => {
    if (!data?.entries) return null
    let commission = 0, commissionReversal = 0, patientCharge = 0, refundPatient = 0, payout = 0, affiliateCommission = 0
    const byTypeMap: Record<string, number> = {}
    const dailyMap: Record<string, number> = {}

    data.entries.forEach((e) => {
      const amt = parseFloat(e.amount)
      if (e.type === 'COMMISSION') {
        commission += amt
        const day = new Date(e.createdAt).toISOString().slice(0, 10)
        dailyMap[day] = (dailyMap[day] || 0) + amt
      } else if (e.type === 'AFFILIATE_COMMISSION') {
        affiliateCommission += amt
      } else if (e.type === 'REFUND_COMMISSION_REVERSAL') {
        commissionReversal += Math.abs(amt)
        const day = new Date(e.createdAt).toISOString().slice(0, 10)
        dailyMap[day] = (dailyMap[day] || 0) - Math.abs(amt)
      } else if (e.type === 'PATIENT_CHARGE') {
        patientCharge += amt
      } else if (e.type === 'REFUND_PATIENT') {
        refundPatient += Math.abs(amt)
      } else if (e.type === 'PAYOUT') {
        payout += Math.abs(amt)
      }
    })

    const platformRevenue = commission - commissionReversal
    const dailyRevenue = Object.entries(dailyMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)

    return { platformRevenue, commission, commissionReversal, affiliateCommission, patientCharge, refundPatient, payout, dailyRevenue }
  }, [data])

  function exportReport(name: string, headers: string[], rows: (string | number)[][]) {
    exportCSV(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.reportsTitle')} icon="analytics" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Card key={`item-${i}`} className="py-5"><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>)}
        </div>
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />
  if (!report) return <ErrorState message={t('admin.noData')} onRetry={refetch} />

  const chartData = report.dailyRevenue.map((d) => ({
    date: formatDate(d.date, locale, { month: 'short', day: 'numeric' }),
    amount: Number(d.amount.toFixed(2)),
  }))

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.reportsTitle')}
        description={t('admin.reportsDesc')}
        icon="analytics"
      />

      {/* Big stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon="payments" label={t('admin.platformRevenue')} value={formatCurrency(report.platformRevenue.toFixed(2), 'USD', locale)} tone="success" subtitle={t('admin.commission')} />
        <StatCard icon="campaign" label="Affiliate commissions" value={formatCurrency(report.affiliateCommission.toFixed(2), 'USD', locale)} tone="info" subtitle="Paid to affiliates" />
        <StatCard icon="receipt_long" label={t('admin.totalProcessed')} value={formatCurrency(report.patientCharge.toFixed(2), 'USD', locale)} tone="primary" />
        <StatCard icon="undo" label={t('admin.totalRefunded')} value={formatCurrency(report.refundPatient.toFixed(2), 'USD', locale)} tone="warning" />
        <StatCard icon="account_balance" label={t('admin.totalPayouts')} value={formatCurrency(report.payout.toFixed(2), 'USD', locale)} tone="info" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Revenue chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('admin.revenueOverTime')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1A73E8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1A73E8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={{ stroke: '#DADCE0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v) => formatCurrency(String(v), 'USD', locale).replace(/\.\d+$/, '')} />
                  <Tooltip
                    cursor={{ stroke: '#1A73E8', strokeWidth: 1 }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }}
                    formatter={(v: number) => [formatCurrency(String(v), 'USD', locale), t('admin.platformRevenue')]}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#1A73E8" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Export buttons */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('admin.exportReport')}</CardTitle>
            <CardDescription>{t('admin.reportsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => exportReport('platform-revenue',
                ['Metric', 'Amount'],
                [[t('admin.platformRevenue'), report.platformRevenue.toFixed(2)], [t('admin.commission'), report.commission.toFixed(2)], [t('admin.refundAmount'), report.commissionReversal.toFixed(2)]]
              )}
              className="justify-start gap-2"
            >
              <Icon name="download" size={16} /> {t('admin.platformRevenue')}
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport('patient-charges',
                ['Metric', 'Amount'],
                [[t('admin.totalProcessed'), report.patientCharge.toFixed(2)], [t('admin.totalRefunded'), report.refundPatient.toFixed(2)]]
              )}
              className="justify-start gap-2"
            >
              <Icon name="download" size={16} /> {t('admin.totalProcessed')}
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport('payouts',
                ['Metric', 'Amount'],
                [[t('admin.totalPayouts'), report.payout.toFixed(2)]]
              )}
              className="justify-start gap-2"
            >
              <Icon name="download" size={16} /> {t('admin.totalPayouts')}
            </Button>
            <Button
              variant="outline"
              onClick={() => exportReport('full-ledger',
                ['Date', 'Type', 'Description', 'Amount', 'User'],
                data.entries.map((e) => [new Date(e.createdAt).toISOString(), e.type, e.description, e.amount, e.user?.email || ''])
              )}
              className="justify-start gap-2"
            >
              <Icon name="download" size={16} /> {t('admin.ledgerTitle')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Main exported component
// ============================================================================

export function AdminDashboard({ section }: { section: string }) {
  switch (section) {
    case 'overview': return <OverviewSection />
    case 'analytics': return <AdminAnalyticsSection />
    case 'bookings': return <AdminBookingsSection />
    case 'messages': return <MessagesSection />
    case 'providers': return <ProvidersSection />
    case 'users': return <UsersSection />
    case 'moderation': return <ModerationSection />
    case 'commission': return <CommissionSection />
    case 'cancellations': return <CancellationsSection />
    case 'payouts': return <PayoutsSection />
    case 'ledger': return <LedgerSection />
    case 'reports': return <ReportsSection />
    case 'disputes': return <DisputesSection />
    case 'affiliates': return <AffiliatesSection />
    case 'kyc': return <AdminKycSection />
    case 'tickets': return <AdminTicketsSection />
    case 'settings': return <AdminSettingsSection />
    case 'profile': return <AdminProfileSection />
    default: return <OverviewSection />
  }
}

// ============================================================================
// Admin Analytics section — platform-wide revenue, user growth, booking trends
// ============================================================================

const ANALYTICS_PIE_COLORS = ['#1A73E8', '#188038', '#F9AB00', '#D93025', '#9334E6']

function AdminAnalyticsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<any>('/api/admin/analytics')

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('admin.analyticsTitle')} description={t('admin.analyticsDesc')} icon="analytics" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`item-${i}`} className="py-5"><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.noData')} onRetry={refetch} />

  const s = data.summary

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.analyticsTitle')} description={t('admin.analyticsDesc')} icon="analytics" />

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard icon="payments" label={t('admin.platformRevenue')} value={formatCurrency(s.platformRevenue, 'USD', locale)} tone="success" />
        <StatCard icon="receipt_long" label={t('admin.totalProcessedShort')} value={formatCurrency(s.totalProcessed, 'USD', locale)} tone="primary" />
        <StatCard icon="undo" label={t('admin.totalRefundedShort')} value={formatCurrency(s.totalRefunded, 'USD', locale)} tone="warning" />
        <StatCard icon="check_circle" label={t('admin.completionRateShort')} value={`${s.completionRate}%`} tone="info" />
        <StatCard icon="group" label={t('admin.totalUsers')} value={String(s.totalUsers)} tone="primary" />
      </div>

      {/* Monthly revenue chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="trending_up" size={18} className="text-success" />
            {t('admin.monthlyRevenue')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.monthlyRevenue} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="adminRevGrad" x1="0" y1="0" x2="0" y2="1">
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
                  formatter={(v: number) => [formatCurrency(String(v), 'USD', locale), t('admin.platformRevenue')]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#188038" strokeWidth={2} fill="url(#adminRevGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Two-column: user growth + bookings by type */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="group_add" size={18} className="text-primary" />
              {t('admin.userGrowth')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.userGrowth} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={{ stroke: '#DADCE0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip cursor={{ fill: '#F1F3F4' }} contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }} />
                  <Bar dataKey="patients" stackId="a" fill="#1A73E8" />
                  <Bar dataKey="providers" stackId="a" fill="#188038" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">{t('admin.patients')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-success" />
                <span className="text-muted-foreground">{t('admin.providersShort')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="pie_chart" size={18} className="text-primary" />
              {t('admin.bookingsByType')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.providerTypeData.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.providerTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2}>
                        {data.providerTypeData.map((_: any, i: number) => <Cell key={`cell-${i}`} fill={ANALYTICS_PIE_COLORS[i % ANALYTICS_PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-4">
                  {data.providerTypeData.map((d: any, i: number) => (
                    <div key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="size-3 rounded-full" style={{ backgroundColor: ANALYTICS_PIE_COLORS[i % ANALYTICS_PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">{t('admin.noData')}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue by type + Top providers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="bar_chart" size={18} className="text-primary" />
              {t('admin.revenueByType')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.revenueByType.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenueByType} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} tickFormatter={(v) => '$' + v} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} width={72} />
                    <Tooltip cursor={{ fill: '#F1F3F4' }} contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }}
                      formatter={(v: number) => [formatCurrency(String(v), 'USD', locale), t('admin.platformRevenue')]} />
                    <Bar dataKey="value" fill="#1A73E8" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">{t('admin.noData')}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="workspace_premium" size={18} className="text-primary" />
              {t('admin.topProviders')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProviders.length > 0 ? (
              data.topProviders.map((p: any, i: number) => (
                <div key={p.email} className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-surface-secondary text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.type}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{formatCurrency(String(p.revenue), 'USD', locale)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(p.revenue / data.topProviders[0].revenue) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{t('admin.noData')}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Disputes section — admin manages booking disputes
// ============================================================================

const DISPUTE_STATUS_BADGE: Record<string, { cls: string; key: string }> = {
  OPEN: { cls: 'bg-warning/10 text-warning border-warning/20', key: 'dispute.open' },
  UNDER_REVIEW: { cls: 'bg-info/10 text-info border-info/20', key: 'dispute.underReview' },
  RESOLVED: { cls: 'bg-success/10 text-success border-success/20', key: 'dispute.resolved' },
  CLOSED: { cls: 'bg-muted text-muted-foreground border-divider', key: 'dispute.closed' },
}

const DISPUTE_TYPE_ICON: Record<string, string> = {
  REFUND_REQUEST: 'undo',
  SERVICE_QUALITY: 'thumb_down',
  SCHEDULING_ISSUE: 'event_busy',
  PAYMENT_ISSUE: 'payments',
  OTHER: 'help',
}

function DisputesSection() {
  const { t, locale } = useT()
  const [tick, setTick] = React.useState(0)
  const { data, loading, error, refetch } = useApi<{ disputes: any[] }>('/api/disputes', { deps: [tick] })
  const [selected, setSelected] = React.useState<any | null>(null)
  const [response, setResponse] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  function refresh() { setTick((x) => x + 1); refetch() }

  async function handleAction(action: 'review' | 'resolve' | 'close') {
    if (!selected) return
    setBusy(true)
    try {
      await apiPost('/api/disputes/resolve', { disputeId: selected.id, action, adminResponse: response || undefined })
      toast.success(action === 'resolve' ? t('dispute.disputeResolved') : action === 'close' ? t('dispute.disputeClosed') : 'Status updated')
      setSelected(null)
      setResponse('')
      refresh()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  const disputes = data?.disputes || []
  const openCount = disputes.filter((d: any) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW').length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dispute.title')}
        description={openCount > 0 ? `${openCount} active disputes need attention` : 'All disputes are resolved'}
        icon="gavel"
      />

      {loading ? (
        <LoadingCard lines={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : disputes.length === 0 ? (
        <EmptyState icon="gavel" title={t('dispute.noDisputes')} description={t('dispute.noDisputesDesc')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Dispute list */}
          <div className="space-y-3">
            {disputes.map((d: any) => {
              const badge = DISPUTE_STATUS_BADGE[d.status] || DISPUTE_STATUS_BADGE.OPEN
              const providerName = d.booking?.doctor?.user?.name || d.booking?.hospital?.name || d.booking?.hotel?.name || d.booking?.translator?.user?.name || '—'
              return (
                <Card
                  key={d.id}
                  className={cn('cursor-pointer gap-0 transition-all hover:shadow-md', selected?.id === d.id && 'ring-2 ring-primary')}
                  onClick={() => { setSelected(d); setResponse(d.adminResponse || '') }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface-secondary text-muted-foreground">
                        <Icon name={DISPUTE_TYPE_ICON[d.type] || 'help'} size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{d.title}</p>
                          <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', badge.cls)}>
                            {t(badge.key)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="person" size={12} />
                            {d.raisedBy?.name || '—'}
                          </span>
                          <span>·</span>
                          <span>{providerName}</span>
                          <span>·</span>
                          <span>{formatCurrency(d.booking?.amount || '0', 'USD', locale)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Detail panel */}
          {selected && (
            <Card className="sticky top-20 h-fit gap-0">
              <CardHeader className="border-b border-divider">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon name="gavel" size={18} className="text-primary" />
                  {selected.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('dispute.raisedBy')}</span>
                    <span className="font-medium text-foreground">{selected.raisedBy?.name} ({selected.raisedBy?.role})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('dispute.openedOn')}</span>
                    <span className="font-medium text-foreground">{formatDateTime(selected.createdAt, locale)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('dispute.bookingRef')}</span>
                    <span className="font-mono text-xs text-foreground">{selected.bookingId.slice(-8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.amount')}</span>
                    <span className="font-medium text-foreground">{formatCurrency(selected.booking?.amount || '0', 'USD', locale)}</span>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('dispute.disputeDesc')}</p>
                  <p className="rounded-[14px] border border-divider bg-surface-secondary/50 p-3 text-sm text-foreground">{selected.description}</p>
                </div>

                {selected.adminResponse && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('dispute.adminResponse')}</p>
                    <p className="rounded-[14px] border-s-2 border-primary bg-accent/20 p-3 text-sm text-foreground">{selected.adminResponse}</p>
                  </div>
                )}

                {(selected.status === 'OPEN' || selected.status === 'UNDER_REVIEW') && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('dispute.adminResponse')}</Label>
                    <Textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder={t('dispute.enterResponse')}
                      rows={3}
                      className="resize-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {selected.status === 'OPEN' && (
                        <Button size="sm" variant="outline" onClick={() => handleAction('review')} disabled={busy} className="gap-1.5">
                          <Icon name="visibility" size={14} />
                          {t('dispute.underReview')}
                        </Button>
                      )}
                      <Button size="sm" variant="success" onClick={() => handleAction('resolve')} disabled={busy} className="gap-1.5">
                        <Icon name="check_circle" size={14} fill />
                        {t('dispute.resolve')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleAction('close')} disabled={busy} className="gap-1.5 text-error hover:bg-error/5">
                        <Icon name="close" size={14} />
                        {t('dispute.close')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Affiliates section — manage affiliate marketers
// ============================================================================

function AffiliatesSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ affiliates: any[] }>('/api/admin/affiliates')
  const [busy, setBusy] = React.useState<string | null>(null)
  const { data: payoutData, refetch: refetchPayouts } = useApi<{ balances: any[]; payouts: any[] }>('/api/admin/affiliate-payouts')
  const [payDialog, setPayDialog] = React.useState<any | null>(null)
  const [payRef, setPayRef] = React.useState('')

  async function handleAction(affiliateId: string, action: string, extra?: any) {
    setBusy(affiliateId + action)
    try {
      await apiPost('/api/admin/affiliates', { affiliateId, action, ...extra })
      toast.success(action === 'approve' ? t('admin.approve') : action === 'suspend' ? t('admin.suspend') : 'Updated')
      refetch()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  async function runAffiliatePayouts() {
    setBusy('affPayouts')
    try {
      const res = await apiPost('/api/admin/affiliate-payouts', {})
      toast.success(`Created ${res.count} affiliate payouts`)
      refetchPayouts()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  async function markAffPayoutPaid() {
    if (!payDialog) return
    setBusy('payAff_' + payDialog.id)
    try {
      await apiPost('/api/admin/affiliate-payouts/pay', { payoutId: payDialog.id, reference: payRef || undefined })
      toast.success('Payout marked as paid')
      setPayDialog(null)
      setPayRef('')
      refetchPayouts()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  if (loading) return <div className="flex flex-col gap-6"><PageHeader title={t('admin.affiliateManagement')} icon="campaign" /><LoadingCard lines={4} /></div>
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const affiliates = data?.affiliates || []
  const pending = affiliates.filter((a: any) => !a.verified)
  const active = affiliates.filter((a: any) => a.verified)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.affiliateManagement')} description={t('admin.affiliateManagementDesc')} icon="campaign" />

      {/* Info banner */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
            <Icon name="info" size={20} fill />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Affiliate commission = percentage of platform commission</p>
            <p className="text-xs text-muted-foreground">Affiliates earn a flat percentage of the platform&rsquo;s commission on referred bookings. Rate is configured per provider type in <span className="font-medium text-primary">Commission rates</span>.</p>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon="campaign" label={t('admin.totalAffiliates')} value={String(affiliates.length)} tone="primary" />
        <StatCard icon="verified" label={t('admin.activeAffiliates')} value={String(active.length)} tone="success" />
        <StatCard icon="hourglass_top" label={t('admin.pendingAffiliates')} value={String(pending.length)} tone="warning" />
      </div>

      {/* Pending affiliates */}
      {pending.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t('admin.affiliateModeration')} ({pending.length})</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pending.map((a: any) => (
              <Card key={a.id} className="gap-0">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                      <Icon name="hourglass_top" size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{a.user.name || a.user.email}</p>
                      <p className="text-xs text-muted-foreground">{a.user.email}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{a.referralCode}</span>
                        {a.website && <span>· {a.website}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="success" onClick={() => handleAction(a.id, 'approve')} disabled={!!busy} className="gap-1.5">
                      <Icon name="check_circle" size={14} fill />
                      {t('admin.approveAffiliate')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleAction(a.id, 'suspend')} disabled={!!busy} className="gap-1.5 text-error">
                      <Icon name="block" size={14} />
                      {t('admin.suspendAffiliate')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* All affiliates table */}
      <Card className="gap-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('admin.affiliateManagement')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {affiliates.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('admin.noAffiliates')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-4 text-xs uppercase tracking-wide text-muted-foreground">Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Code</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Clicks</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Signups</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Bookings</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Earnings</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Status</TableHead>
                  <TableHead className="pe-4 text-end text-xs uppercase tracking-wide text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {affiliates.map((a: any) => (
                  <TableRow key={a.id} className="border-divider">
                    <TableCell className="ps-4">
                      <p className="text-sm font-medium text-foreground">{a.user.name || a.user.email}</p>
                      <p className="text-xs text-muted-foreground">{a.user.email}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground">{a.referralCode}</TableCell>
                    <TableCell className="text-sm text-foreground tabular-nums">{a.totalClicks}</TableCell>
                    <TableCell className="text-sm text-foreground tabular-nums">{a.totalSignups}</TableCell>
                    <TableCell className="text-sm text-foreground tabular-nums">{a.totalBookings}</TableCell>
                    <TableCell className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(a.totalEarnings, 'USD', locale)}</TableCell>
                    <TableCell>
                      {a.verified ? (
                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{t('common.active')}</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">{t('common.pending')}</span>
                      )}
                    </TableCell>
                    <TableCell className="pe-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {a.verified ? (
                          <Button size="sm" variant="ghost" onClick={() => handleAction(a.id, 'suspend')} disabled={!!busy} className="text-error hover:bg-error/5" title={t('admin.suspendAffiliate')}>
                            <Icon name="block" size={14} />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => handleAction(a.id, 'approve')} disabled={!!busy} className="text-success hover:bg-success/5" title={t('admin.approveAffiliate')}>
                            <Icon name="check_circle" size={14} fill />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Affiliate payouts section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="account_balance" size={18} className="text-primary" />
              Affiliate payouts
            </CardTitle>
            <Button size="sm" variant="outline" onClick={runAffiliatePayouts} disabled={busy === 'affPayouts'} className="gap-1.5">
              {busy === 'affPayouts' ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="playlist_add" size={14} />}
              Run settlement batch
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Affiliate balances */}
          {payoutData?.balances && payoutData.balances.length > 0 && (
            <div className="border-b border-divider p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Available balances</p>
              <div className="space-y-2">
                {payoutData.balances.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between rounded-[12px] bg-surface-secondary/60 px-4 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-foreground">{b.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">Pending: <span className="font-medium text-foreground">{formatCurrency(b.pendingBalance, 'USD', locale)}</span></span>
                      <span className="font-semibold text-success">{formatCurrency(b.availableBalance, 'USD', locale)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payout history */}
          {payoutData?.payouts && payoutData.payouts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-4 text-xs uppercase tracking-wide text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Affiliate</TableHead>
                  <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Status</TableHead>
                  <TableHead className="pe-4 text-end text-xs uppercase tracking-wide text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payoutData.payouts.map((p: any) => (
                  <TableRow key={p.id} className="border-divider">
                    <TableCell className="ps-4 text-sm text-muted-foreground">{formatDate(p.createdAt, locale)}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{p.affiliate?.user?.name || '—'}</TableCell>
                    <TableCell className="text-end text-sm font-semibold text-foreground tabular-nums">{formatCurrency(p.amount, 'USD', locale)}</TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', p.status === 'COMPLETED' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                        {p.status}
                      </span>
                    </TableCell>
                    <TableCell className="pe-4 text-end">
                      {p.status === 'PENDING' && (
                        <Button size="sm" variant="outline" onClick={() => { setPayDialog(p); setPayRef('') }} className="gap-1.5">
                          <Icon name="payments" size={14} />
                          Mark paid
                        </Button>
                      )}
                      {p.reference && <span className="text-xs text-muted-foreground">{p.reference}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No affiliate payouts yet</div>
          )}
        </CardContent>
      </Card>

      {/* Mark payout paid dialog */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="payments" size={20} className="text-primary" />
              Mark payout as paid
            </DialogTitle>
            <DialogDescription>
              {payDialog?.affiliate?.user?.name} · {payDialog && formatCurrency(payDialog.amount, 'USD', locale)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Bank transfer ref..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button onClick={markAffPayoutPaid} disabled={busy?.startsWith('payAff')} className="gap-1.5">
              {busy?.startsWith('payAff') ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="check_circle" size={14} fill />}
              Confirm paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Admin KYC section — review doctor identity documents
// ============================================================================

const KYC_DOC_TYPES: Record<string, { icon: string; cls: string; label: string }> = {
  medical_license: { icon: 'medical_information', cls: 'bg-primary/10 text-primary', label: 'Medical License' },
  id_card: { icon: 'badge', cls: 'bg-warning/10 text-warning', label: 'ID Card' },
  diploma: { icon: 'school', cls: 'bg-success/10 text-success', label: 'Diploma' },
  passport: { icon: 'passport', cls: 'bg-info/10 text-info', label: 'Passport' },
  other: { icon: 'description', cls: 'bg-muted text-muted-foreground', label: 'Other' },
}

function AdminKycSection() {
  const { t, locale } = useT()
  const [tick, setTick] = React.useState(0)
  const { data, loading, error, refetch } = useApi<{ documents: any[] }>('/api/admin/kyc', { deps: [tick] })
  const [busy, setBusy] = React.useState<string | null>(null)

  async function handleReview(docId: string, action: 'approve' | 'reject') {
    setBusy(docId + action)
    try {
      await apiPost('/api/admin/kyc', { documentId: docId, action })
      toast.success(action === 'approve' ? 'Document approved' : 'Document rejected')
      setTick(x => x + 1); refetch()
    } catch (e: any) { toast.error(e.message) } finally { setBusy(null) }
  }

  if (loading) return <div className="flex flex-col gap-6"><PageHeader title={t('kyc.adminTitle')} icon="badge" /><LoadingCard lines={4} /></div>
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const docs = data?.documents || []
  const pending = docs.filter((d: any) => d.status === 'PENDING')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('kyc.adminTitle')} description={t('kyc.adminDesc')} icon="badge" />

      {pending.length > 0 && (
        <Card className="border-warning/20 bg-warning/[0.02]">
          <CardContent className="flex items-center gap-3 p-4">
            <Icon name="hourglass_top" size={20} className="text-warning" fill />
            <p className="text-sm font-medium text-foreground">{pending.length} document{pending.length === 1 ? '' : 's'} pending review</p>
          </CardContent>
        </Card>
      )}

      {docs.length === 0 ? (
        <EmptyState icon="badge" title="No KYC documents" description="No doctors have submitted verification documents yet." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc: any) => {
            const cfg = KYC_DOC_TYPES[doc.docType] || KYC_DOC_TYPES.other
            return (
              <Card key={doc.id} className="gap-0">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-[10px]', cfg.cls)}>
                      <Icon name={cfg.icon} size={20} fill />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{doc.user?.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{doc.user?.email}</p>
                      {doc.user?.doctor?.specialty && <p className="text-xs text-muted-foreground">{doc.user.doctor.specialty}</p>}
                      <p className="mt-1 text-xs font-medium text-foreground">{cfg.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{doc.fileName} · {relativeTime(doc.createdAt, locale)}</p>
                      {doc.adminNote && <p className="mt-1 text-xs text-error">{doc.adminNote}</p>}
                    </div>
                    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      doc.status === 'APPROVED' ? 'bg-success/10 text-success border-success/20' :
                      doc.status === 'PENDING' ? 'bg-warning/10 text-warning border-warning/20' :
                      doc.status === 'REJECTED' ? 'bg-error/10 text-error border-error/20' :
                      'bg-muted text-muted-foreground border-divider')}>
                      {doc.status}
                    </span>
                  </div>
                  {doc.status === 'PENDING' && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="success" onClick={() => handleReview(doc.id, 'approve')} disabled={!!busy} className="gap-1.5 flex-1">
                        <Icon name="check_circle" size={14} fill />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleReview(doc.id, 'reject')} disabled={!!busy} className="gap-1.5 flex-1 text-error hover:bg-error/5">
                        <Icon name="cancel" size={14} />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Admin Tickets section — uses shared TicketsSection with isAdmin=true
// ============================================================================

function AdminTicketsSection() {
  return <TicketsSection isAdmin={true} />
}
// ============================================================================

function AdminBookingsSection() {
  const { t, locale } = useT()
  const goMessages = useApp((s) => s.goMessages)
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const { data, loading, error, refetch } = useApi<{ bookings: any[] }>(
    `/api/bookings${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`
  )
  const [detail, setDetail] = React.useState<any | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function adminCancel(bookingId: string) {
    setBusy(true)
    try {
      await apiPost('/api/bookings/cancel', { bookingId, reason: 'Cancelled by admin' })
      toast.success('Booking cancelled')
      setDetail(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to cancel')
    } finally {
      setBusy(false)
    }
  }

  async function adminComplete(bookingId: string) {
    setBusy(true)
    try {
      await apiPost('/api/bookings/complete', { bookingId })
      toast.success('Booking marked complete')
      setDetail(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to complete')
    } finally {
      setBusy(false)
    }
  }

  const bookings = data?.bookings || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('admin.allBookings')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.allBookingsDesc')}</p>
      </div>

      <div className="flex gap-2">
        {['all', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? t('common.all') : t(`common.${s.toLowerCase()}` as any)}
          </Button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : error ? (
        <Card><CardContent className="p-6 text-error">{error}</CardContent></Card>
      ) : bookings.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">{t('admin.noBookings')}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-divider bg-surface-secondary">
                  <TableHead className="ps-4">{t('booking.patient')}</TableHead>
                  <TableHead>{t('booking.provider')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('common.date')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-end">{t('common.amount')}</TableHead>
                  <TableHead className="pe-4 text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id} className="border-divider">
                    <TableCell className="ps-4 text-sm">{b.patient?.name || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {b.doctor?.user?.name || b.hospital?.name || b.hotel?.name || b.translator?.user?.name || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(b.startDate, locale)}</TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="text-end text-sm font-medium tabular-nums">{formatCurrency(b.amount, 'USD', locale)}</TableCell>
                    <TableCell className="pe-4 text-end">
                      <Button variant="outline" size="sm" onClick={() => setDetail(b)}>
                        {t('common.view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Booking detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('booking.detailTitle')}</DialogTitle>
            <DialogDescription>
              {detail?.patient?.name || '—'} · {formatDate(detail?.startDate, locale)}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.status')}</span>
                <StatusBadge status={detail.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('common.amount')}</span>
                <span className="font-medium">{formatCurrency(detail.amount, 'USD', locale)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('booking.visitType')}</span>
                <span>{detail.visitType === 'ONLINE' ? t('booking.online') : t('booking.inPerson')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('booking.provider')}</span>
                <span>{detail.doctor?.user?.name || detail.hospital?.name || detail.hotel?.name || detail.translator?.user?.name || '—'}</span>
              </div>
              {detail.notes && (
                <div>
                  <p className="mb-1 text-muted-foreground">{t('common.notes')}</p>
                  <p className="rounded-lg border border-divider bg-surface p-2">{detail.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="gap-1.5" onClick={() => goMessages(detail?.id)} disabled={!detail}>
              <Icon name="forum" size={16} fill />
              {t('chat.openChat')}
            </Button>
            {detail?.status === 'CONFIRMED' && (
              <Button variant="success" className="gap-1.5" onClick={() => adminComplete(detail.id)} disabled={busy}>
                <Icon name="task_alt" size={16} />
                {t('booking.markComplete')}
              </Button>
            )}
            {(detail?.status === 'PENDING' || detail?.status === 'CONFIRMED') && (
              <Button variant="outline" className="gap-1.5 text-error hover:bg-error/5" onClick={() => adminCancel(detail.id)} disabled={busy}>
                <Icon name="close" size={16} />
                {t('common.cancel')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetail(null)}>{t('booking.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Admin Settings section — platform-wide configuration
// ============================================================================

function AdminSettingsSection() {
  const { t } = useT()
  const { data, loading, error, refetch } = useApi<{ settings: Record<string, string> }>('/api/admin/settings')
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (data?.settings) setValues(data.settings)
  }, [data])

  async function save() {
    setSaving(true)
    try {
      await apiPut('/api/admin/settings', { settings: values })
      toast.success(t('admin.settingsSaved'))
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const knownKeys = [
    { key: 'platformName', label: t('admin.platformName'), type: 'text' },
    { key: 'defaultCurrency', label: t('admin.defaultCurrency'), type: 'text' },
    { key: 'payoutScheduleDays', label: t('admin.payoutScheduleDays'), type: 'number' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('admin.platformSettings')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.platformSettingsDesc')}</p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : error ? (
        <Card><CardContent className="p-6 text-error">{error}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('admin.generalSettings')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {knownKeys.map(({ key, label, type }) => (
              <div key={key} className="grid gap-2 sm:grid-cols-3 sm:items-center">
                <Label className="text-sm font-medium">{label}</Label>
                <Input
                  type={type}
                  value={values[key] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  className="sm:col-span-2"
                />
              </div>
            ))}
            <Separator />
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
                {t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Admin Profile section — edit own account
// ============================================================================

function AdminProfileSection() {
  const { t, locale } = useT()
  const session = useApp((s) => s.session)
  const { data, loading, error, refetch } = useApi<{ user: any }>('/api/profile')
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (data?.user) {
      setName(data.user.name || '')
      setPhone(data.user.phone || '')
    }
  }, [data])

  async function save() {
    setSaving(true)
    try {
      await apiPut('/api/profile', { name, phone })
      toast.success(t('profile.updated'))
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (error) return <Card><CardContent className="p-6 text-error">{error}</CardContent></Card>

  const initials = (session?.name || session?.email || 'A').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('dash.profile')}</h1>
        <p className="text-sm text-muted-foreground">{t('profile.adminDesc')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile.accountInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
              {initials}
            </div>
            <div>
              <p className="font-medium text-foreground">{session?.name || '—'}</p>
              <p className="text-sm text-muted-foreground">{session?.email}</p>
              <Badge variant="outline" className="mt-1 rounded-full border-primary/20 bg-primary/5 text-primary">{t('role.admin')}</Badge>
            </div>
          </div>
          <Separator />
          <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
            <Label className="text-sm font-medium">{t('common.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
            <Label className="text-sm font-medium">{t('common.phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="sm:col-span-2" />
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
              {t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
