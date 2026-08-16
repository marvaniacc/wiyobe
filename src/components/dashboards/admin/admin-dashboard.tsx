'use client'

import * as React from 'react'
import { Icon } from '@/components/shared/icon'
import { MessagesSection } from '@/components/chat/messages-section'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost, apiPut, apiPatch, apiDelete } from '@/hooks/use-api'
import { TiptapEditor, type TiptapJSON } from '@/components/admin/tiptap-editor'
import { TiptapPreview } from '@/components/admin/tiptap-preview'
import { MediaPicker } from '@/components/shared/media-picker'
import { TicketsSection } from '@/components/shared/tickets-section'
import { useApp } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatCurrency, formatDate, formatDateTime, relativeTime } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
  | 'PATIENT_CHARGE' | 'COMMISSION' | 'AFFILIATE_COMMISSION' | 'AFFILIATE_COMMISSION_REVERSAL'
  | 'PROVIDER_CREDIT' | 'PROVIDER_DEBIT'
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
    AFFILIATE_COMMISSION: 'bg-primary/10 text-primary border border-primary/20',
    AFFILIATE_COMMISSION_REVERSAL: 'bg-error/10 text-error border border-error/20',
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
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (data?.rates) {
      const map: Record<ProviderType, string> = { DOCTOR: '', HOSPITAL: '', HOTEL: '', TRANSLATOR: '' }
      data.rates.forEach((r) => { map[r.providerType] = r.rate })
      setRates(map)
    }
  }, [data])

  async function save() {
    setSaving(true)
    try {
      // Only send platform rate — affiliate rate is managed separately
      const payload = { rates: (Object.keys(rates) as ProviderType[]).map((pt) => ({ providerType: pt, rate: rates[pt] || '0' })) }
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
            <div className="hidden grid-cols-[1fr_120px_60px] items-center gap-3 px-1 sm:grid">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider type</span>
              <span className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform %</span>
              <span className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Rate</span>
            </div>

            {types.map((pt) => {
              const platform = parseFloat(rates[pt]) || 0
              return (
                <div key={pt} className="grid grid-cols-1 items-center gap-3 rounded-[14px] border border-divider bg-surface-secondary/40 p-4 sm:grid-cols-[1fr_120px_60px]">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                      <Icon name={iconFor(pt)} size={22} fill />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t(PROVIDER_TYPE_LABEL_KEY[pt])}</p>
                      <p className="text-xs text-muted-foreground">Platform commission rate</p>
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
                  <div className="text-center">
                    <span className="text-lg font-bold text-foreground tabular-nums">{platform}%</span>
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

        {/* Info card explaining the platform commission system */}
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
              <span>Platform % is deducted from each booking amount.</span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>The provider receives the booking amount minus the platform commission.</span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>Affiliate commission comes out of the platform&rsquo;s share, not the provider&rsquo;s.</span>
            </div>
            <Separator className="my-2" />
            <div className="rounded-[12px] bg-surface-secondary p-3">
              <p className="text-xs font-medium text-foreground">Example</p>
              <p className="mt-1 text-xs">Booking: $100, Platform: 30%</p>
              <p className="text-xs">Platform commission: $30</p>
              <p className="text-xs">Provider receives: $70</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Affiliate Rates section — separate from platform commission rates
// ============================================================================

function AffiliateRatesSection() {
  const { t } = useT()
  const { data, loading, error, refetch } = useApi<{ rates: CommissionRate[] }>('/api/admin/commission')
  const [affRates, setAffRates] = React.useState<Record<ProviderType, string>>({ DOCTOR: '', HOSPITAL: '', HOTEL: '', TRANSLATOR: '' })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (data?.rates) {
      const affMap: Record<ProviderType, string> = { DOCTOR: '', HOSPITAL: '', HOTEL: '', TRANSLATOR: '' }
      data.rates.forEach((r) => { affMap[r.providerType] = r.affiliateRate })
      setAffRates(affMap)
    }
  }, [data])

  async function save() {
    setSaving(true)
    try {
      // Only send affiliate rate — platform rate is managed separately
      const payload = { rates: (Object.keys(affRates) as ProviderType[]).map((pt) => ({ providerType: pt, affiliateRate: affRates[pt] || '0' })) }
      await apiPut('/api/admin/commission', payload)
      toast.success('Affiliate rates updated')
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div><LoadingCard lines={4} /></div>
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  const types: ProviderType[] = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
  const iconFor = (pt: ProviderType) => pt === 'DOCTOR' ? 'medical_services' : pt === 'HOSPITAL' ? 'local_hospital' : pt === 'HOTEL' ? 'hotel' : 'translate'

  return (
    <div className="animate-fade-in">
      <PageHeader title="Affiliate Program Settings" description="Set the affiliate commission rate for each provider type. This is the percentage of the PLATFORM'S commission that the affiliate receives." icon="campaign" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Affiliate Commission Rates</CardTitle>
            <CardDescription>Percentage of platform commission paid to affiliates</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {types.map((pt) => {
              const platformRate = data.rates.find(r => r.providerType === pt)?.rate || '0'
              const affRate = parseFloat(affRates[pt]) || 0
              const platformCut = parseFloat(platformRate)
              const affDollar = (platformCut * affRate / 100).toFixed(2)
              return (
                <div key={pt} className="grid grid-cols-1 items-center gap-3 rounded-[14px] border border-divider bg-surface-secondary/40 p-4 sm:grid-cols-[1fr_120px_1fr]">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                      <Icon name={iconFor(pt)} size={22} fill />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t(PROVIDER_TYPE_LABEL_KEY[pt])}</p>
                      <p className="text-xs text-muted-foreground">Platform: {platformRate}% → Affiliate: {affRate}% = ${affDollar} on $100</p>
                    </div>
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
                  <div className="text-center text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">${affDollar}</span> per $100 booking
                  </div>
                </div>
              )
            })}
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving} className="gap-1.5">
                <Icon name="save" size={16} /> Save affiliate rates
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="info" size={18} className="text-primary" />
              How affiliate commission works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>Affiliate rate is a percentage of the PLATFORM&rsquo;S commission, not the booking amount.</span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>The affiliate commission comes out of the platform&rsquo;s pocket — the provider&rsquo;s earnings are unaffected.</span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-success" fill />
              <span>If no affiliate is attributed, the platform keeps the full commission.</span>
            </div>
            <Separator className="my-2" />
            <div className="rounded-[12px] bg-surface-secondary p-3">
              <p className="text-xs font-medium text-foreground">Example</p>
              <p className="mt-1 text-xs">Booking: $100, Platform: 30%, Affiliate: 25%</p>
              <p className="text-xs">Platform commission: $30</p>
              <p className="text-xs">Affiliate gets: $30 × 25% = $7.50</p>
              <p className="text-xs">Platform keeps: $30 - $7.50 = $22.50</p>
              <p className="text-xs">Provider receives: $70</p>
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
  'PATIENT_CHARGE', 'COMMISSION', 'AFFILIATE_COMMISSION', 'AFFILIATE_COMMISSION_REVERSAL',
  'PROVIDER_CREDIT', 'PROVIDER_DEBIT',
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
// Section: Promo Codes — CRUD for promo code management
// ============================================================================

type PromoCode = {
  id: string
  code: string
  discountType: 'PERCENTAGE' | 'FIXED'
  discountValue: number
  maxUses: number | null
  usedCount: number
  expiryDate: string | null
  isActive: boolean
  createdAt: string
  _count?: { bookings: number }
}

function PromoCodesSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ promoCodes: PromoCode[] }>('/api/admin/promo-codes')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<PromoCode | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const codes = data?.promoCodes || []

  async function toggleActive(pc: PromoCode) {
    try {
      await apiPatch('/api/admin/promo-codes', { id: pc.id, isActive: !pc.isActive })
      toast.success(pc.isActive ? t('promo.deactivated', 'Promo code deactivated') : t('promo.activated', 'Promo code activated'))
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/promo-codes?id=${deleteTarget.id}`)
      toast.success(t('promo.deleted', 'Promo code deleted'))
      setDeleteTarget(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.promoCodes', 'Promo Codes')} icon="local_offer" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.promoCodes', 'Promo Codes')}
        description={t('admin.promoCodesDesc', 'Create and manage promotional discount codes for patients')}
        icon="local_offer"
        action={
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Icon name="add" size={18} />
            {t('promo.create', 'Create Code')}
          </Button>
        }
      />

      {codes.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon name="local_offer" size={32} className="text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t('promo.noCodes', 'No promo codes yet')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('promo.noCodesDesc', 'Create a promo code to offer patients discounts at checkout. Discounts are deducted from the platform commission, not provider revenue.')}</p>
            <Button onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
              <Icon name="add" size={16} />
              {t('promo.create', 'Create Code')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[16px] border border-divider">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('promo.code', 'Code')}</TableHead>
                <TableHead>{t('promo.discount', 'Discount')}</TableHead>
                <TableHead className="text-center">{t('promo.usage', 'Usage')}</TableHead>
                <TableHead>{t('promo.expiry', 'Expiry')}</TableHead>
                <TableHead className="text-center">{t('common.status', 'Status')}</TableHead>
                <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((pc) => {
                const isExpired = pc.expiryDate && new Date(pc.expiryDate) < new Date()
                const usageExhausted = pc.maxUses !== null && pc.usedCount >= pc.maxUses
                return (
                  <TableRow key={pc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="rounded-md bg-primary/5 px-2 py-0.5 text-sm font-semibold text-primary">{pc.code}</code>
                        {pc._count?.bookings ? (
                          <span className="text-xs text-muted-foreground">{pc._count.bookings} {t('promo.bookings', 'bookings')}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-foreground">
                        {pc.discountType === 'PERCENTAGE' ? `${pc.discountValue}%` : formatCurrency(String(pc.discountValue / 100), 'USD', locale)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {pc.usedCount}{pc.maxUses !== null ? ` / ${pc.maxUses}` : ''}
                      </span>
                    </TableCell>
                    <TableCell>
                      {pc.expiryDate ? (
                        <span className={cn('text-sm', isExpired ? 'text-error' : 'text-muted-foreground')}>
                          {formatDate(pc.expiryDate, locale)}
                          {isExpired && <span className="ms-1 text-xs">({t('promo.expired', 'expired')})</span>}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full border',
                          pc.isActive && !isExpired && !usageExhausted
                            ? 'border-success/20 bg-success/10 text-success'
                            : 'border-divider bg-muted text-muted-foreground'
                        )}
                      >
                        {pc.isActive && !isExpired && !usageExhausted ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(pc)}
                          title={pc.isActive ? t('promo.deactivate', 'Deactivate') : t('promo.activate', 'Activate')}
                          className="gap-1"
                        >
                          <Icon name={pc.isActive ? 'toggle_off' : 'toggle_on'} size={18} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(pc)}
                          disabled={pc.usedCount > 0}
                          title={pc.usedCount > 0 ? t('promo.cannotDeleteUsed', 'Cannot delete a used code') : t('common.delete', 'Delete')}
                          className="text-error hover:bg-error/5"
                        >
                          <Icon name="delete" size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Info banner about financial model */}
      <div className="mt-4 flex items-start gap-2 rounded-[12px] border border-info/20 bg-info/5 p-3.5">
        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-info" />
        <p className="text-xs text-muted-foreground">
          {t('promo.financialNote', 'Promo code discounts are deducted from the platform commission. The provider always receives their full revenue. If an affiliate is involved, their commission is calculated on the reduced platform commission.')}
        </p>
      </div>

      <CreatePromoCodeDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); refetch() }} />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="warning" size={20} className="text-error" />
              {t('promo.deleteTitle', 'Delete promo code?')}
            </DialogTitle>
            <DialogDescription>
              {t('promo.deleteConfirm', 'Are you sure you want to delete the code')} <code className="font-semibold text-foreground">{deleteTarget?.code}</code>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
              {deleting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="delete" size={16} />}
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreatePromoCodeDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const { t } = useT()
  const [code, setCode] = React.useState('')
  const [discountType, setDiscountType] = React.useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE')
  const [discountValue, setDiscountValue] = React.useState('')
  const [maxUses, setMaxUses] = React.useState('')
  const [expiryDate, setExpiryDate] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setCode('')
      setDiscountType('PERCENTAGE')
      setDiscountValue('')
      setMaxUses('')
      setExpiryDate('')
    }
  }, [open])

  async function handleCreate() {
    if (!code.trim() || !discountValue) return
    setSaving(true)
    try {
      await apiPost('/api/admin/promo-codes', {
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: parseInt(discountValue, 10),
        maxUses: maxUses ? parseInt(maxUses, 10) : null,
        expiryDate: expiryDate || null,
        isActive: true,
      })
      toast.success(t('promo.created', 'Promo code created'))
      onCreated()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="local_offer" size={20} className="text-primary" />
            {t('promo.create', 'Create Promo Code')}
          </DialogTitle>
          <DialogDescription>{t('promo.createDesc', 'Create a new discount code for patients.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('promo.code', 'Code')}</Label>
            <Input
              placeholder="WINTER10"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('promo.type', 'Type')}</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'PERCENTAGE' | 'FIXED')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">{t('promo.percentage', 'Percentage')}</SelectItem>
                  <SelectItem value="FIXED">{t('promo.fixed', 'Fixed amount')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {discountType === 'PERCENTAGE' ? t('promo.valuePercent', 'Value (%)') : t('promo.valueFixed', 'Value (cents)')}
              </Label>
              <Input
                type="number"
                placeholder={discountType === 'PERCENTAGE' ? '10' : '500'}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                min={1}
                max={discountType === 'PERCENTAGE' ? 100 : undefined}
              />
              {discountType === 'FIXED' && (
                <p className="text-[11px] text-muted-foreground">{t('promo.fixedHint', 'Enter amount in cents (500 = $5.00)')}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('promo.maxUses', 'Max uses (optional)')}</Label>
              <Input
                type="number"
                placeholder="∞"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                min={1}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('promo.expiry', 'Expiry date')}</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleCreate} disabled={!code.trim() || !discountValue || saving} className="gap-1.5">
            {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
            {t('promo.create', 'Create Code')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Section: Blog Posts — in-app CMS with TipTap editor
// ============================================================================

type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: any
  coverImage: string | null
  authorId: string
  status: 'DRAFT' | 'PUBLISHED'
  seoTitle: string | null
  seoDescription: string | null
  focusKeyword: string | null
  canonicalUrl: string | null
  noIndex: boolean
  createdAt: string
  updatedAt: string
  author?: { id: string; name: string | null; email: string }
}

function BlogSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ posts: BlogPost[] }>('/api/admin/blog')
  const [editing, setEditing] = React.useState<BlogPost | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [previewPost, setPreviewPost] = React.useState<BlogPost | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<BlogPost | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const posts = data?.posts || []

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/blog/${deleteTarget.id}`)
      toast.success(t('blog.deleted', 'Post deleted'))
      setDeleteTarget(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.blogPosts', 'Blog Posts')} icon="article" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.blogPosts', 'Blog Posts')}
        description={t('admin.blogDesc', 'Write and publish blog posts and marketing pages')}
        icon="article"
        action={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Icon name="add" size={18} />
            {t('admin.newPost', 'New Post')}
          </Button>
        }
      />

      {posts.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon name="article" size={32} className="text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t('blog.noPosts', 'No posts yet')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('blog.noPostsDesc', 'Create your first blog post to start publishing content.')}</p>
            <Button onClick={() => setCreating(true)} className="mt-2 gap-1.5">
              <Icon name="add" size={16} />
              {t('admin.newPost', 'New Post')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[16px] border border-divider">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.title', 'Title')}</TableHead>
                <TableHead>{t('blog.slug', 'Slug')}</TableHead>
                <TableHead>{t('blog.author', 'Author')}</TableHead>
                <TableHead className="text-center">{t('common.status', 'Status')}</TableHead>
                <TableHead>{t('blog.updated', 'Updated')}</TableHead>
                <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setPreviewPost(post)}
                      className="flex items-center gap-2 text-left transition-opacity hover:opacity-80"
                      title={t('blog.preview', 'Preview')}
                    >
                      {post.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.coverImage} alt="" className="size-9 shrink-0 rounded-[8px] object-cover" />
                      )}
                      <span className="max-w-xs truncate text-sm font-medium text-primary hover:underline">{post.title}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">/{post.slug}</code>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{post.author?.name || post.author?.email || '—'}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full border',
                        post.status === 'PUBLISHED'
                          ? 'border-success/20 bg-success/10 text-success'
                          : 'border-warning/20 bg-warning/10 text-warning',
                      )}
                    >
                      {post.status === 'PUBLISHED' ? t('admin.published', 'Published') : t('admin.draft', 'Draft')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{relativeTime(post.updatedAt, locale)}</span>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(post)}
                        title={t('common.edit', 'Edit')}
                        className="gap-1"
                      >
                        <Icon name="edit" size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(post)}
                        title={t('common.delete', 'Delete')}
                        className="text-error hover:bg-error/5"
                      >
                        <Icon name="delete" size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Editor dialog (create or edit) */}
      <BlogEditorDialog
        open={creating || !!editing}
        post={editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }}
        onSaved={() => { setCreating(false); setEditing(null); refetch() }}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="warning" size={20} className="text-error" />
              {t('blog.deleteTitle', 'Delete post?')}
            </DialogTitle>
            <DialogDescription>
              {t('blog.deleteConfirm', 'Are you sure you want to delete')} <span className="font-semibold text-foreground">{deleteTarget?.title}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
              {deleting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="delete" size={16} />}
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post preview — renders the stored TipTap JSON as it will appear publicly */}
      <Dialog open={!!previewPost} onOpenChange={(o) => !o && setPreviewPost(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="visibility" size={20} className="text-primary" />
              {t('blog.preview', 'Preview')}
            </DialogTitle>
            <DialogDescription>{t('blog.previewDesc', 'This is how the post will appear to readers.')}</DialogDescription>
          </DialogHeader>

          {previewPost && (
            <article className="space-y-4">
              {/* Cover image */}
              {previewPost.coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewPost.coverImage} alt={previewPost.title} className="aspect-[16/9] w-full rounded-[14px] object-cover" />
              )}

              {/* Title + meta */}
              <div>
                <h1 className="text-2xl font-bold text-foreground">{previewPost.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Icon name="person" size={14} />
                    {previewPost.author?.name || previewPost.author?.email || '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="event" size={14} />
                    {formatDate(previewPost.createdAt, locale)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full border',
                      previewPost.status === 'PUBLISHED'
                        ? 'border-success/20 bg-success/10 text-success'
                        : 'border-warning/20 bg-warning/10 text-warning',
                    )}
                  >
                    {previewPost.status === 'PUBLISHED' ? t('admin.published', 'Published') : t('admin.draft', 'Draft')}
                  </Badge>
                </div>
              </div>

              {/* Excerpt */}
              {previewPost.excerpt && (
                <p className="rounded-[12px] border-s-2 border-primary bg-primary/5 p-3 text-sm italic text-muted-foreground">
                  {previewPost.excerpt}
                </p>
              )}

              {/* Rendered content */}
              <div className="rounded-[14px] border border-divider p-5">
                <TiptapPreview content={previewPost.content as TiptapJSON} />
              </div>
            </article>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewPost(null)}>{t('common.close', 'Close')}</Button>
            <Button onClick={() => { const p = previewPost; setPreviewPost(null); setEditing(p) }} className="gap-1.5">
              <Icon name="edit" size={16} />
              {t('blog.editPost', 'Edit Post')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BlogEditorDialog({ open, post, onOpenChange, onSaved }: {
  open: boolean
  post: BlogPost | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const { t } = useT()
  const [title, setTitle] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [excerpt, setExcerpt] = React.useState('')
  const [coverImage, setCoverImage] = React.useState('')
  const [status, setStatus] = React.useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [content, setContent] = React.useState<TiptapJSON | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = React.useState(false)
  const [seoTitle, setSeoTitle] = React.useState('')
  const [seoDescription, setSeoDescription] = React.useState('')
  const [focusKeyword, setFocusKeyword] = React.useState('')
  const [canonicalUrl, setCanonicalUrl] = React.useState('')
  const [noIndex, setNoIndex] = React.useState(false)

  // Sync form state when the dialog opens (for create or edit).
  React.useEffect(() => {
    if (open) {
      setTitle(post?.title || '')
      setSlug(post?.slug || '')
      setExcerpt(post?.excerpt || '')
      setCoverImage(post?.coverImage || '')
      setStatus(post?.status || 'DRAFT')
      setContent(post?.content ? (post.content as TiptapJSON) : null)
      setSeoTitle(post?.seoTitle || '')
      setSeoDescription(post?.seoDescription || '')
      setFocusKeyword(post?.focusKeyword || '')
      setCanonicalUrl(post?.canonicalUrl || '')
      setNoIndex(post?.noIndex || false)
    }
  }, [open, post])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        excerpt: excerpt.trim(),
        content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
        coverImage: coverImage.trim() || null,
        status,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        focusKeyword: focusKeyword.trim() || null,
        canonicalUrl: canonicalUrl.trim() || null,
        noIndex,
      }
      if (post) {
        await apiPatch(`/api/admin/blog/${post.id}`, payload)
        toast.success(t('blog.updated', 'Post updated'))
      } else {
        await apiPost('/api/admin/blog', payload)
        toast.success(t('blog.created', 'Post created'))
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="article" size={20} className="text-primary" />
            {post ? t('blog.editPost', 'Edit Post') : t('admin.newPost', 'New Post')}
          </DialogTitle>
          <DialogDescription>{t('blog.editorDesc', 'Write your post content using the rich text editor.')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title + Slug */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('admin.title', 'Title')}</Label>
              <Input
                placeholder="My Blog Post"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('admin.slug', 'Slug')}</Label>
              <Input
                placeholder="auto-generated from title"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Excerpt */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('admin.excerpt', 'Excerpt')}</Label>
            <Textarea
              placeholder={t('blog.excerptPlaceholder', 'A short summary shown on blog cards…')}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">{excerpt.length}/500</p>
          </div>

          {/* Cover Image — full width */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('admin.coverImage', 'Cover Image')}</Label>
            {coverImage ? (
              <div className="relative overflow-hidden rounded-[12px] border border-divider">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt="Cover preview" className="aspect-[16/9] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setCoverImage('')}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-surface/90 text-error shadow-sm transition-colors hover:bg-error hover:text-error-foreground"
                  title={t('common.remove', 'Remove')}
                >
                  <Icon name="close" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setMediaPickerOpen(true)}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-surface"
                >
                  <Icon name="swap_horiz" size={14} />
                  {t('media.change', 'Change')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMediaPickerOpen(true)}
                className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-divider transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <Icon name="add_photo_alternate" size={28} className="text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">{t('media.selectCover', 'Select Cover Image')}</span>
              </button>
            )}
          </div>

          {/* Content editor — image insertion is via the TipTap toolbar's Add Image button */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('admin.content', 'Content')}</Label>
            <TiptapEditor content={content} onChange={setContent} />
          </div>

          {/* SEO Section */}
          <div className="space-y-3 rounded-[14px] border border-divider bg-surface-secondary/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon name="search" size={16} className="text-primary" />
              {t('seo.section', 'SEO Settings')}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.metaTitle', 'Meta Title')}</Label>
                <Input
                  placeholder={t('seo.metaTitlePlaceholder', 'Defaults to post title if empty')}
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  maxLength={200}
                />
                <p className="text-[11px] text-muted-foreground">{seoTitle.length}/200</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.focusKeyword', 'Focus Keyword')}</Label>
                <Input
                  placeholder={t('seo.focusKeywordPlaceholder', 'e.g. medical tourism turkey')}
                  value={focusKeyword}
                  onChange={(e) => setFocusKeyword(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.metaDescription', 'Meta Description')}</Label>
              <Textarea
                placeholder={t('seo.metaDescPlaceholder', 'Defaults to excerpt if empty')}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={2}
                maxLength={500}
              />
              <p className="text-[11px] text-muted-foreground">{seoDescription.length}/500</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.canonicalUrl', 'Canonical URL')}</Label>
                <Input
                  placeholder={t('seo.canonicalPlaceholder', 'https://wishubest.com/… (optional)')}
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-[12px] border border-divider p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('seo.noIndex', 'No Index')}</p>
                  <p className="text-xs text-muted-foreground">{t('seo.noIndexHint', 'Exclude from search engines')}</p>
                </div>
                <Switch checked={noIndex} onCheckedChange={setNoIndex} aria-label={t('seo.noIndex', 'No Index')} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          {/* Status dropdown moved here for better visual layout */}
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-muted-foreground">{t('common.status', 'Status')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'DRAFT' | 'PUBLISHED')}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">{t('admin.draft', 'Draft')}</SelectItem>
                <SelectItem value="PUBLISHED">{t('admin.published', 'Published')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving} className="gap-1.5">
              {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
              {post ? t('common.save', 'Save') : t('blog.create', 'Create')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Media Picker — for selecting a cover image */}
      <MediaPicker
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelected={(path) => setCoverImage(path)}
        filter="image"
      />
    </Dialog>
  )
}

type CustomPage = {
  id: string
  title: string
  slug: string
  htmlContent: string
  seoTitle: string | null
  seoDescription: string | null
  focusKeyword: string | null
  canonicalUrl: string | null
  noIndex: boolean
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

function CustomPagesSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ pages: CustomPage[] }>('/api/admin/pages')
  const [editing, setEditing] = React.useState<CustomPage | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<CustomPage | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const pages = data?.pages || []

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/pages/${deleteTarget.id}`)
      toast.success(t('pages.deleted', 'Page deleted'))
      setDeleteTarget(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.customPages', 'Custom Pages')} icon="web" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.customPages', 'Custom Pages')}
        description={t('admin.customPagesDesc', 'Create custom landing pages with raw HTML/CSS')}
        icon="web"
        action={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Icon name="add" size={18} />
            {t('admin.newPage', 'New Page')}
          </Button>
        }
      />

      {pages.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon name="web" size={32} className="text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t('pages.noPages', 'No custom pages yet')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('pages.noPagesDesc', 'Create custom landing pages like /about-us or /services with your own HTML/CSS code.')}</p>
            <Button onClick={() => setCreating(true)} className="mt-2 gap-1.5">
              <Icon name="add" size={16} />
              {t('admin.newPage', 'New Page')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[16px] border border-divider">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.title', 'Title')}</TableHead>
                <TableHead>{t('blog.slug', 'Slug')}</TableHead>
                <TableHead className="text-center">{t('common.status', 'Status')}</TableHead>
                <TableHead>{t('blog.updated', 'Updated')}</TableHead>
                <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell>
                    <span className="max-w-xs truncate text-sm font-medium text-foreground">{page.title}</span>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">/{page.slug}</code>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-full border',
                        page.isPublished
                          ? 'border-success/20 bg-success/10 text-success'
                          : 'border-warning/20 bg-warning/10 text-warning',
                      )}
                    >
                      {page.isPublished ? t('admin.published', 'Published') : t('admin.draft', 'Draft')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{relativeTime(page.updatedAt, locale)}</span>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(page)}
                        title={t('common.edit', 'Edit')}
                        className="gap-1"
                      >
                        <Icon name="edit" size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(page)}
                        title={t('common.delete', 'Delete')}
                        className="text-error hover:bg-error/5"
                      >
                        <Icon name="delete" size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CustomPageEditorDialog
        open={creating || !!editing}
        page={editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }}
        onSaved={() => { setCreating(false); setEditing(null); refetch() }}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="warning" size={20} className="text-error" />
              {t('pages.deleteTitle', 'Delete page?')}
            </DialogTitle>
            <DialogDescription>
              {t('blog.deleteConfirm', 'Are you sure you want to delete')} <span className="font-semibold text-foreground">{deleteTarget?.title}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-1.5">
              {deleting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="delete" size={16} />}
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CustomPageEditorDialog({ open, page, onOpenChange, onSaved }: {
  open: boolean
  page: CustomPage | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const { t } = useT()
  const [title, setTitle] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [seoTitle, setSeoTitle] = React.useState('')
  const [seoDescription, setSeoDescription] = React.useState('')
  const [focusKeyword, setFocusKeyword] = React.useState('')
  const [canonicalUrl, setCanonicalUrl] = React.useState('')
  const [noIndex, setNoIndex] = React.useState(false)
  const [isPublished, setIsPublished] = React.useState(false)
  const [htmlContent, setHtmlContent] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setTitle(page?.title || '')
      setSlug(page?.slug || '')
      setSeoTitle(page?.seoTitle || '')
      setSeoDescription(page?.seoDescription || '')
      setFocusKeyword(page?.focusKeyword || '')
      setCanonicalUrl(page?.canonicalUrl || '')
      setNoIndex(page?.noIndex || false)
      setIsPublished(page?.isPublished || false)
      setHtmlContent(page?.htmlContent || '')
    }
  }, [open, page])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        htmlContent,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        focusKeyword: focusKeyword.trim() || null,
        canonicalUrl: canonicalUrl.trim() || null,
        noIndex,
        isPublished,
      }
      if (page) {
        await apiPatch(`/api/admin/pages/${page.id}`, payload)
        toast.success(t('pages.updated', 'Page updated'))
      } else {
        await apiPost('/api/admin/pages', payload)
        toast.success(t('pages.created', 'Page created'))
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="web" size={20} className="text-primary" />
            {page ? t('pages.editPage', 'Edit Page') : t('admin.newPage', 'New Page')}
          </DialogTitle>
          <DialogDescription>{t('pages.editorDesc', 'Create a custom landing page with raw HTML/CSS.')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title + Slug */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('admin.title', 'Title')}</Label>
              <Input placeholder="About Us" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('blog.slug', 'Slug')}</Label>
              <Input placeholder="auto-generated from title" value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono text-sm" />
            </div>
          </div>

          {/* HTML Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('admin.htmlContent', 'HTML Content')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMediaPickerOpen(true)}
                className="gap-1.5"
              >
                <Icon name="perm_media" size={14} />
                {t('media.insert', 'Insert Media')}
              </Button>
            </div>
            <textarea
              placeholder={'<div style="padding: 40px;">\n  <h1>Welcome to our page</h1>\n  <p>Custom HTML/CSS here…</p>\n</div>'}
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              rows={14}
              className="flex w-full rounded-[14px] border border-divider bg-surface px-3.5 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">{t('pages.htmlHint', 'Paste raw HTML/CSS here. The content is rendered as-is (no sanitization).')}</p>
          </div>

          {/* SEO Section */}
          <div className="space-y-3 rounded-[14px] border border-divider bg-surface-secondary/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon name="search" size={16} className="text-primary" />
              {t('seo.section', 'SEO Settings')}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.metaTitle', 'Meta Title')}</Label>
                <Input
                  placeholder={t('seo.metaTitlePlaceholder', 'Defaults to page title if empty')}
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  maxLength={200}
                />
                <p className="text-[11px] text-muted-foreground">{seoTitle.length}/200</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.focusKeyword', 'Focus Keyword')}</Label>
                <Input
                  placeholder={t('seo.focusKeywordPlaceholder', 'e.g. about wishubest')}
                  value={focusKeyword}
                  onChange={(e) => setFocusKeyword(e.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.metaDescription', 'Meta Description')}</Label>
              <Textarea
                placeholder={t('seo.metaDescPlaceholder', 'Meta description for search engines')}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={2}
                maxLength={500}
              />
              <p className="text-[11px] text-muted-foreground">{seoDescription.length}/500</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('seo.canonicalUrl', 'Canonical URL')}</Label>
                <Input
                  placeholder={t('seo.canonicalPlaceholder', 'https://wishubest.com/… (optional)')}
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-[12px] border border-divider p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('seo.noIndex', 'No Index')}</p>
                  <p className="text-xs text-muted-foreground">{t('seo.noIndexHint', 'Exclude from search engines')}</p>
                </div>
                <Switch checked={noIndex} onCheckedChange={setNoIndex} aria-label={t('seo.noIndex', 'No Index')} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          {/* Published toggle moved to footer for better visual layout */}
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-muted-foreground">{t('admin.published', 'Published')}</Label>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} aria-label={t('admin.published', 'Published')} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving} className="gap-1.5">
              {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
              {page ? t('common.save', 'Save') : t('blog.create', 'Create')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Media Picker — inserts an <img> tag at the end of the HTML content */}
      <MediaPicker
        open={mediaPickerOpen}
        onOpenChange={setMediaPickerOpen}
        onSelected={(path) => {
          // Insert an <img> tag with the selected file path into the HTML content
          const imgTag = `<img src="${path}" alt="" style="max-width: 100%; height: auto;" />`
          setHtmlContent((prev) => prev + '\n' + imgTag)
        }}
      />
    </Dialog>
  )
}

// ============================================================================
// Section: Recycle Bin — restore or permanently delete soft-deleted items
// ============================================================================

type RecycleItem = {
  id: string
  title?: string
  slug?: string
  fileName?: string
  filePath?: string
  mimeType?: string
  fileType?: string
  category?: string
  deletedAt: string
  updatedAt?: string
}

type RecycleBinData = {
  items: {
    blogPosts: RecycleItem[]
    customPages: RecycleItem[]
    mediaAssets: RecycleItem[]
    medicalDocuments: RecycleItem[]
  }
}

const MODEL_TYPE_LABELS: Record<string, { label: string; icon: string; cls: string }> = {
  blogPost: { label: 'Blog Posts', icon: 'article', cls: 'bg-primary/10 text-primary' },
  customPage: { label: 'Custom Pages', icon: 'web', cls: 'bg-info/10 text-info' },
  mediaAsset: { label: 'Media Assets', icon: 'perm_media', cls: 'bg-warning/10 text-warning' },
  medicalDocument: { label: 'Medical Documents', icon: 'folder_shared', cls: 'bg-success/10 text-success' },
}

function RecycleBinSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<RecycleBinData>('/api/admin/recycle-bin')
  const [confirmDelete, setConfirmDelete] = React.useState<{ modelType: string; id: string; name: string } | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const items = data?.items

  async function handleRestore(modelType: string, id: string) {
    try {
      await apiPatch('/api/admin/recycle-bin', { modelType, id })
      toast.success(t('common.restore', 'Restored'))
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    }
  }

  async function handlePermanentDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await apiDelete(`/api/admin/recycle-bin?modelType=${confirmDelete.modelType}&id=${confirmDelete.id}`)
      toast.success(t('common.deletePermanently', 'Permanently deleted'))
      setConfirmDelete(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.recycleBin', 'Recycle Bin')} icon="delete_sweep" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  const totalCount = (items?.blogPosts.length || 0) + (items?.customPages.length || 0) + (items?.mediaAssets.length || 0) + (items?.medicalDocuments.length || 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.recycleBin', 'Recycle Bin')}
        description={t('recycleBin.desc', 'Restore or permanently delete items. Items are automatically purged after 30 days.')}
        icon="delete_sweep"
      />

      {/* Warning banner */}
      <div className="mt-6 flex items-start gap-2 rounded-[12px] border border-warning/20 bg-warning/5 p-3.5">
        <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-xs text-muted-foreground">
          {t('recycleBin.warning', 'Items in the recycle bin are automatically permanently deleted after 30 days. Permanent deletion cannot be undone.')}
        </p>
      </div>

      {totalCount === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon name="delete_sweep" size={32} className="text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t('recycleBin.empty', 'Recycle bin is empty')}</p>
            <p className="text-xs text-muted-foreground">{t('recycleBin.emptyDesc', 'Deleted items will appear here for 30 days.')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {(['blogPost', 'customPage', 'mediaAsset', 'medicalDocument'] as const).map((modelType) => {
            const groupItems = items?.[modelType === 'blogPost' ? 'blogPosts' : modelType === 'customPage' ? 'customPages' : modelType === 'mediaAsset' ? 'mediaAssets' : 'medicalDocuments'] || []
            if (groupItems.length === 0) return null
            const cfg = MODEL_TYPE_LABELS[modelType]
            return (
              <div key={modelType}>
                <div className="mb-3 flex items-center gap-2">
                  <div className={cn('flex size-7 items-center justify-center rounded-[8px]', cfg.cls)}>
                    <Icon name={cfg.icon} size={16} fill />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{cfg.label}</h3>
                  <span className="text-xs text-muted-foreground">({groupItems.length})</span>
                </div>
                <div className="overflow-hidden rounded-[16px] border border-divider">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.title', 'Name')}</TableHead>
                        <TableHead>{t('common.deletedAt', 'Deleted')}</TableHead>
                        <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="max-w-xs truncate text-sm font-medium text-foreground">
                              {item.title || item.fileName || item.slug || item.id}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{relativeTime(item.deletedAt, locale)}</span>
                          </TableCell>
                          <TableCell className="text-end">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestore(modelType, item.id)}
                                className="gap-1.5"
                                title={t('common.restore', 'Restore')}
                              >
                                <Icon name="restore" size={14} />
                                <span className="hidden sm:inline">{t('common.restore', 'Restore')}</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDelete({ modelType, id: item.id, name: item.title || item.fileName || item.slug || item.id })}
                                className="text-error hover:bg-error/5"
                                title={t('common.deletePermanently', 'Delete Permanently')}
                              >
                                <Icon name="delete_forever" size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
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

// ============================================================================
// Section: Broadcast — send notifications to specific roles
// ============================================================================

function BroadcastSection() {
  const { t } = useT()
  const [title, setTitle] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [category, setCategory] = React.useState('ANNOUNCEMENT')
  const [targetRole, setTargetRole] = React.useState('ALL')
  const [sending, setSending] = React.useState(false)
  const [result, setResult] = React.useState<{ recipientCount: number } | null>(null)

  async function handleSend() {
    if (!title.trim() || !message.trim()) return
    setSending(true)
    setResult(null)
    try {
      const res = await apiPost<{ ok: boolean; recipientCount: number }>('/api/admin/notifications/broadcast', {
        title: title.trim(),
        message: message.trim(),
        category,
        targetRole,
      })
      setResult({ recipientCount: res.recipientCount })
      toast.success(t('admin.sentSuccessfully', 'Notification sent successfully') + ` (${res.recipientCount} recipients)`)
      setTitle('')
      setMessage('')
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.broadcast', 'Send Notification')}
        description={t('admin.broadcastDesc', 'Broadcast a notification to specific user roles or all users')}
        icon="campaign"
      />

      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('admin.title', 'Title')}</Label>
              <Input
                placeholder={t('admin.broadcastTitlePlaceholder', 'e.g. Scheduled Maintenance Notice')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('admin.message', 'Message')}</Label>
              <Textarea
                placeholder={t('admin.broadcastMsgPlaceholder', 'Write your notification message here…')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
              />
              <p className="text-[11px] text-muted-foreground">{message.length}/2000</p>
            </div>

            {/* Category + Target Role */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t('admin.category', 'Category')}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANNOUNCEMENT">{t('notifications.cat.announcement', 'Announcement')}</SelectItem>
                    <SelectItem value="SYSTEM">{t('notifications.cat.system', 'System')}</SelectItem>
                    <SelectItem value="BOOKING">{t('notifications.cat.booking', 'Booking')}</SelectItem>
                    <SelectItem value="PROMO">{t('notifications.cat.promo', 'Promo')}</SelectItem>
                    <SelectItem value="MEDICAL">{t('notifications.cat.medical', 'Medical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t('admin.targetRole', 'Target Role')}</Label>
                <Select value={targetRole} onValueChange={setTargetRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t('role.all', 'All Users')}</SelectItem>
                    <SelectItem value="PATIENT">{t('role.patient', 'Patients')}</SelectItem>
                    <SelectItem value="DOCTOR">{t('role.doctor', 'Doctors')}</SelectItem>
                    <SelectItem value="HOSPITAL">{t('role.hospital', 'Hospitals')}</SelectItem>
                    <SelectItem value="HOTEL">{t('role.hotel', 'Hotels')}</SelectItem>
                    <SelectItem value="TRANSLATOR">{t('role.translator', 'Translators')}</SelectItem>
                    <SelectItem value="AFFILIATE">{t('role.affiliate', 'Affiliates')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Send button */}
            <div className="flex items-center justify-between gap-3 pt-2">
              {result && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Icon name="check_circle" size={16} fill />
                  {t('admin.sentSuccessfully', 'Sent successfully')} · {result.recipientCount} recipients
                </p>
              )}
              <Button
                onClick={handleSend}
                disabled={!title.trim() || !message.trim() || sending}
                className="ms-auto gap-1.5"
              >
                {sending ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="send" size={16} />}
                {t('admin.send', 'Send')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Section: KYC Requirements — define required documents per provider type
// ============================================================================

type KycRequirement = {
  id: string
  providerType: string
  documentName: string
  description: string | null
  isRequired: boolean
  order: number
  createdAt: string
  _count?: { documents: number }
}

const PROVIDER_TYPES = [
  { key: 'DOCTOR', icon: 'medical_services', cls: 'bg-primary/10 text-primary' },
  { key: 'HOSPITAL', icon: 'local_hospital', cls: 'bg-info/10 text-info' },
  { key: 'HOTEL', icon: 'hotel', cls: 'bg-warning/10 text-warning' },
  { key: 'TRANSLATOR', icon: 'translate', cls: 'bg-[#9334E6]/10 text-[#9334E6]' },
] as const

function KycRequirementsSection() {
  const { t } = useT()
  const [activeType, setActiveType] = React.useState<string>('DOCTOR')
  const [requirements, setRequirements] = React.useState<KycRequirement[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<KycRequirement | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<KycRequirement | null>(null)

  const fetchReqs = React.useCallback(async (pt: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/kyc-requirements?providerType=${pt}`)
      const data = await res.json()
      setRequirements(data.requirements || [])
    } catch {
      setRequirements([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchReqs(activeType)
  }, [activeType, fetchReqs])

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/admin/kyc-requirements/${deleteTarget.id}`)
      toast.success(t('common.delete', 'Deleted'))
      setDeleteTarget(null)
      fetchReqs(activeType)
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.kycRequirements', 'KYC Requirements')}
        description={t('admin.kycRequirementsDesc', 'Define what documents each provider type must submit for verification')}
        icon="verified_user"
        action={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Icon name="add" size={18} />
            {t('admin.addRequirement', 'Add Requirement')}
          </Button>
        }
      />

      {/* Provider type tabs */}
      <div className="mt-6 flex gap-2">
        {PROVIDER_TYPES.map((pt) => (
          <button
            key={pt.key}
            onClick={() => setActiveType(pt.key)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              activeType === pt.key
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-divider bg-surface text-muted-foreground hover:bg-surface-secondary'
            )}
          >
            <Icon name={pt.icon} size={18} fill />
            {t(`role.${pt.key.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {/* Requirements list */}
      <div className="mt-6">
        {loading ? (
          <LoadingCard lines={3} />
        ) : requirements.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Icon name="folder_off" size={32} className="text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{t('kyc.noRequirements', 'No requirements defined yet')}</p>
              <p className="text-xs text-muted-foreground">{t('kyc.noRequirementsDesc', 'Add required documents for this provider type.')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-divider">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{t('admin.documentName', 'Document Name')}</TableHead>
                  <TableHead>{t('admin.documentDesc', 'Description')}</TableHead>
                  <TableHead className="text-center">{t('kyc.required', 'Required')}</TableHead>
                  <TableHead className="text-center">{t('kyc.submissions', 'Submissions')}</TableHead>
                  <TableHead className="text-end">{t('common.actions', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <span className="flex size-6 items-center justify-center rounded-full bg-surface-secondary text-xs font-medium text-muted-foreground">
                        {req.order}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-foreground">{req.documentName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{req.description || '—'}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn('rounded-full border', req.isRequired ? 'border-error/20 bg-error/5 text-error' : 'border-divider text-muted-foreground')}>
                        {req.isRequired ? t('common.yes', 'Yes') : t('common.no', 'No')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm tabular-nums text-muted-foreground">{req._count?.documents || 0}</span>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(req)} title={t('common.edit', 'Edit')} className="gap-1">
                          <Icon name="edit" size={16} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(req)} title={t('common.delete', 'Delete')} className="text-error hover:bg-error/5">
                          <Icon name="delete" size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit/Create dialog */}
      <KycRequirementDialog
        open={creating || !!editing}
        requirement={editing}
        providerType={activeType}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }}
        onSaved={() => { setCreating(false); setEditing(null); fetchReqs(activeType) }}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="warning" size={20} className="text-error" />
              {t('common.delete', 'Delete')}
            </DialogTitle>
            <DialogDescription>
              {t('kyc.deleteConfirm', 'Delete requirement')} <span className="font-semibold text-foreground">{deleteTarget?.documentName}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} className="gap-1.5">
              <Icon name="delete" size={16} />
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KycRequirementDialog({ open, requirement, providerType, onOpenChange, onSaved }: {
  open: boolean
  requirement: KycRequirement | null
  providerType: string
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const { t } = useT()
  const [documentName, setDocumentName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [isRequired, setIsRequired] = React.useState(true)
  const [order, setOrder] = React.useState(0)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setDocumentName(requirement?.documentName || '')
      setDescription(requirement?.description || '')
      setIsRequired(requirement?.isRequired ?? true)
      setOrder(requirement?.order ?? 0)
    }
  }, [open, requirement])

  async function handleSave() {
    if (!documentName.trim()) return
    setSaving(true)
    try {
      const payload = {
        providerType,
        documentName: documentName.trim(),
        description: description.trim() || null,
        isRequired,
        order,
      }
      if (requirement) {
        await apiPatch(`/api/admin/kyc-requirements/${requirement.id}`, payload)
        toast.success(t('common.saved', 'Saved'))
      } else {
        await apiPost('/api/admin/kyc-requirements', payload)
        toast.success(t('common.created', 'Created'))
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="verified_user" size={20} className="text-primary" />
            {requirement ? t('common.edit', 'Edit') : t('admin.addRequirement', 'Add Requirement')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('admin.documentName', 'Document Name')}</Label>
            <Input placeholder="Medical License" value={documentName} onChange={(e) => setDocumentName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('admin.documentDesc', 'Description')}</Label>
            <Textarea placeholder={t('kyc.descPlaceholder', 'Instructions for the provider…')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-[12px] border border-divider p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t('kyc.required', 'Required')}</p>
              </div>
              <Switch checked={isRequired} onCheckedChange={setIsRequired} aria-label={t('kyc.required', 'Required')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('kyc.order', 'Order')}</Label>
              <Input type="number" value={order} onChange={(e) => setOrder(parseInt(e.target.value) || 0)} min={0} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleSave} disabled={!documentName.trim() || saving} className="gap-1.5">
            {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
            {requirement ? t('common.save', 'Save') : t('common.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Section: KYC Review — review provider document submissions
// ============================================================================

type KycReviewProvider = {
  id: string
  name: string | null
  email: string
  role: string
  kycStatus: string
  createdAt: string
  kycDocuments: any[]
  requirements: any[]
}

function KycReviewSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ providers: KycReviewProvider[] }>('/api/admin/kyc')
  const [selectedProvider, setSelectedProvider] = React.useState<KycReviewProvider | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<{ docId: string; docName: string } | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')
  const [rejecting, setRejecting] = React.useState(false)
  const [approvingUser, setApprovingUser] = React.useState(false)

  const providers = data?.providers || []

  async function handleApproveDoc(docId: string) {
    try {
      await apiPatch(`/api/admin/kyc/${docId}`, { status: 'APPROVED' })
      toast.success(t('admin.approveDocument', 'Document approved'))
      refetch()
      // Refresh the selected provider's data
      if (selectedProvider) {
        const res = await fetch('/api/admin/kyc')
        const d = await res.json()
        const updated = (d.providers || []).find((p: any) => p.id === selectedProvider.id)
        if (updated) setSelectedProvider(updated)
      }
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    }
  }

  async function handleRejectDoc() {
    if (!rejectTarget || !rejectReason.trim()) return
    setRejecting(true)
    try {
      await apiPatch(`/api/admin/kyc/${rejectTarget.docId}`, {
        status: 'REJECTED',
        rejectionReason: rejectReason.trim(),
      })
      toast.success(t('admin.rejectDocument', 'Document rejected'))
      setRejectTarget(null)
      setRejectReason('')
      refetch()
      if (selectedProvider) {
        const res = await fetch('/api/admin/kyc')
        const d = await res.json()
        const updated = (d.providers || []).find((p: any) => p.id === selectedProvider.id)
        if (updated) setSelectedProvider(updated)
      }
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setRejecting(false)
    }
  }

  async function handleApproveUser(userId: string) {
    setApprovingUser(true)
    try {
      await apiPost('/api/admin/kyc/approve-user', { userId })
      toast.success(t('admin.allDocumentsApproved', 'Provider KYC approved — dashboard unlocked'))
      setSelectedProvider(null)
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('admin.error'))
    } finally {
      setApprovingUser(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={t('admin.kycReview', 'KYC Review')} icon="verified_user" />
        <LoadingCard lines={4} />
      </div>
    )
  }
  if (error || !data) return <ErrorState message={error || t('admin.error')} onRetry={refetch} />

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('admin.kycReview', 'KYC Review')}
        description={t('admin.kycReviewDesc', 'Review and approve provider document submissions')}
        icon="verified_user"
      />

      {providers.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon name="verified_user" size={32} className="text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t('admin.kycNoPending', 'No pending KYC reviews')}</p>
            <p className="text-xs text-muted-foreground">{t('admin.kycNoPendingDesc', 'All providers are verified or have no pending submissions.')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          {providers.map((p) => {
            const pendingDocs = p.kycDocuments.filter((d: any) => d.reviewStatus === 'PENDING').length
            const approvedDocs = p.kycDocuments.filter((d: any) => d.reviewStatus === 'APPROVED').length
            const totalRequired = p.requirements.filter((r: any) => r.isRequired).length
            const allApproved = totalRequired > 0 && p.kycDocuments.filter((d: any) => d.reviewStatus === 'APPROVED' && d.requirement?.isRequired).length >= totalRequired

            return (
              <Card key={p.id} className="gap-0 transition-all hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                      <Icon name={p.role === 'DOCTOR' ? 'medical_services' : p.role === 'HOSPITAL' ? 'local_hospital' : p.role === 'HOTEL' ? 'hotel' : 'translate'} size={20} fill />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{p.name || p.email}</p>
                          <p className="text-xs text-muted-foreground">{t(`role.${p.role.toLowerCase()}`)} · {relativeTime(p.createdAt, locale)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full border',
                              p.kycStatus === 'APPROVED' ? 'border-success/20 bg-success/10 text-success'
                              : p.kycStatus === 'IN_REVIEW' ? 'border-warning/20 bg-warning/10 text-warning'
                              : 'border-divider text-muted-foreground'
                            )}
                          >
                            {p.kycStatus}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Icon name="description" size={12} />{p.kycDocuments.length} docs</span>
                        {pendingDocs > 0 && <span className="flex items-center gap-1 text-warning"><Icon name="hourglass_top" size={12} />{pendingDocs} pending</span>}
                        <span className="flex items-center gap-1 text-success"><Icon name="check_circle" size={12} />{approvedDocs} approved</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setSelectedProvider(p)} className="shrink-0 gap-1.5">
                      <Icon name="visibility" size={14} />
                      {t('admin.reviewDocument', 'Review')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Provider detail dialog */}
      <Dialog open={!!selectedProvider} onOpenChange={(o) => !o && setSelectedProvider(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="verified_user" size={20} className="text-primary" />
              {selectedProvider?.name || selectedProvider?.email}
            </DialogTitle>
            <DialogDescription>{t('admin.kycReviewDesc', 'Review and approve provider document submissions')}</DialogDescription>
          </DialogHeader>

          {selectedProvider && (
            <div className="space-y-4 py-2">
              {selectedProvider.requirements.map((req: any) => {
                const doc = selectedProvider.kycDocuments.find((d: any) => d.requirementId === req.id)
                const status = doc?.reviewStatus || 'not_uploaded'
                return (
                  <div key={req.id} className="rounded-[14px] border border-divider p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{req.order}. {req.documentName}</p>
                        {req.description && <p className="mt-0.5 text-xs text-muted-foreground">{req.description}</p>}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'shrink-0 rounded-full border',
                          status === 'APPROVED' ? 'border-success/20 bg-success/10 text-success'
                          : status === 'PENDING' ? 'border-warning/20 bg-warning/10 text-warning'
                          : status === 'REJECTED' ? 'border-error/20 bg-error/10 text-error'
                          : 'border-divider text-muted-foreground'
                        )}
                      >
                        {status === 'not_uploaded' ? 'Not Uploaded' : status}
                      </Badge>
                    </div>

                    {/* Document details */}
                    {doc && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Icon name="description" size={12} />
                          <span>{doc.fileName}</span>
                          <span>·</span>
                          <span>{formatDate(doc.uploadedAt, locale)}</span>
                        </div>

                        {/* Preview */}
                        {doc.fileType?.startsWith('image/') && doc.dataUrl?.startsWith('/uploads/') && (
                          <div className="overflow-hidden rounded-[10px] border border-divider">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={doc.dataUrl} alt={doc.fileName} className="max-h-48 w-full object-contain bg-surface-secondary" />
                          </div>
                        )}

                        {/* Rejection reason */}
                        {status === 'REJECTED' && doc.rejectionReason && (
                          <div className="rounded-[8px] border-s-2 border-error bg-error/5 p-2">
                            <p className="text-xs text-error">{doc.rejectionReason}</p>
                          </div>
                        )}

                        {/* Action buttons */}
                        {status === 'PENDING' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleApproveDoc(doc.id)} className="gap-1.5 text-success hover:bg-success/5">
                              <Icon name="check_circle" size={14} />
                              {t('admin.approveDocument', 'Approve')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejectTarget({ docId: doc.id, docName: req.documentName })} className="gap-1.5 text-error hover:bg-error/5">
                              <Icon name="cancel" size={14} />
                              {t('admin.rejectDocument', 'Reject')}
                            </Button>
                          </div>
                        )}
                        {status === 'REJECTED' && (
                          <Button size="sm" variant="outline" onClick={() => handleApproveDoc(doc.id)} className="gap-1.5 text-success hover:bg-success/5">
                            <Icon name="undo" size={14} />
                            {t('admin.approveDocument', 'Approve')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Approve user button */}
              <div className="border-t border-divider pt-4">
                <Button
                  onClick={() => handleApproveUser(selectedProvider.id)}
                  disabled={approvingUser || !selectedProvider.requirements.every((r: any) => {
                    if (!r.isRequired) return true
                    const doc = selectedProvider.kycDocuments.find((d: any) => d.requirementId === r.id)
                    return doc?.reviewStatus === 'APPROVED'
                  })}
                  className="w-full gap-2"
                >
                  {approvingUser ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="verified_user" size={16} />}
                  {t('admin.approveUser', 'Approve Provider')}
                </Button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">
                  {t('admin.approveUserHint', 'All required documents must be approved first')}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="cancel" size={20} className="text-error" />
              {t('admin.rejectDocument', 'Reject Document')}
            </DialogTitle>
            <DialogDescription>{rejectTarget?.docName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('admin.rejectReason', 'Rejection Reason')}</Label>
            <Textarea
              placeholder={t('admin.rejectReasonPlaceholder', 'Explain why this document is being rejected…')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason('') }}>{t('common.cancel', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleRejectDoc} disabled={!rejectReason.trim() || rejecting} className="gap-1.5">
              {rejecting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="cancel" size={16} />}
              {t('admin.rejectDocument', 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    case 'affiliate-rates': return <AffiliateRatesSection />
    case 'promo-codes': return <PromoCodesSection />
    case 'blog': return <BlogSection />
    case 'custom-pages': return <CustomPagesSection />
    case 'cancellations': return <CancellationsSection />
    case 'payouts': return <PayoutsSection />
    case 'ledger': return <LedgerSection />
    case 'reports': return <ReportsSection />
    case 'disputes': return <DisputesSection />
    case 'affiliates': return <AffiliatesSection />
    case 'kyc': return <AdminKycSection />
    case 'tickets': return <AdminTicketsSection />
    case 'settings': return <AdminSettingsSection />
    case 'locations': return <LocationsSection />
    case 'recycle-bin': return <RecycleBinSection />
    case 'broadcast': return <BroadcastSection />
    case 'kyc-requirements': return <KycRequirementsSection />
    case 'kyc-review': return <KycReviewSection />
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

  // Site identity settings
  const siteFields = [
    { key: 'siteName', label: 'Site Name', placeholder: 'Wishubest', type: 'text' },
    { key: 'tagline', label: 'Tagline', placeholder: 'Global Medical Tourism Marketplace', type: 'text' },
    { key: 'logoUrl', label: 'Logo URL', placeholder: 'https://…/logo.svg', type: 'text' },
  ]

  // Default SEO settings
  const seoFields = [
    { key: 'defaultSeoTitle', label: 'Default SEO Title', placeholder: 'Wishubest — Medical Tourism', type: 'text' },
    { key: 'defaultSeoDescription', label: 'Default SEO Description', placeholder: 'Compare and book verified doctors…', type: 'textarea' },
  ]

  // Legacy platform settings
  const platformFields = [
    { key: 'platformName', label: t('admin.platformName'), type: 'text' },
    { key: 'defaultCurrency', label: t('admin.defaultCurrency'), type: 'text' },
    { key: 'payoutScheduleDays', label: t('admin.payoutScheduleDays'), type: 'number' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.platformSettings')} description={t('admin.platformSettingsDesc')} icon="settings" />

      {loading ? (
        <LoadingCard lines={4} />
      ) : error ? (
        <Card><CardContent className="p-6 text-error">{error}</CardContent></Card>
      ) : (
        <>
          {/* Site Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="badge" size={18} className="text-primary" />
                Site Identity
              </CardTitle>
              <CardDescription>Configure the site name, tagline, and logo shown across the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {siteFields.map(({ key, label, placeholder, type }) => (
                <div key={key} className="grid gap-2 sm:grid-cols-3 sm:items-center">
                  <Label className="text-sm font-medium">{label}</Label>
                  <Input
                    type={type}
                    placeholder={placeholder}
                    value={values[key] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    className="sm:col-span-2"
                  />
                </div>
              ))}
              {/* Logo preview */}
              {values.logoUrl && (
                <div className="flex items-center gap-2 rounded-[10px] border border-divider p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={values.logoUrl} alt="Logo preview" className="h-8 w-auto" />
                  <span className="text-xs text-muted-foreground">Logo preview</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Default SEO */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="search" size={18} className="text-primary" />
                Default SEO
              </CardTitle>
              <CardDescription>Default meta title and description used when individual pages don't override them.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {seoFields.map(({ key, label, placeholder, type }) => (
                <div key={key} className="grid gap-2 sm:grid-cols-3 sm:items-start">
                  <Label className="pt-2.5 text-sm font-medium">{label}</Label>
                  {type === 'textarea' ? (
                    <Textarea
                      placeholder={placeholder}
                      value={values[key] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      rows={2}
                      maxLength={500}
                      className="sm:col-span-2"
                    />
                  ) : (
                    <Input
                      type={type}
                      placeholder={placeholder}
                      value={values[key] || ''}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="sm:col-span-2"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Registration Control */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="app_registration" size={18} className="text-primary" />
                Registration Control
              </CardTitle>
              <CardDescription>Open or close signups for each provider type. When closed, new users cannot register as that role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                { key: 'signupOpenDoctor', label: 'Doctor Signups' },
                { key: 'signupOpenHospital', label: 'Hospital Signups' },
                { key: 'signupOpenHotel', label: 'Hotel Signups' },
                { key: 'signupOpenTranslator', label: 'Translator Signups' },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-[12px] border border-divider p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {values[key] === 'false' ? 'Closed — new registrations blocked' : 'Open — accepting new registrations'}
                    </p>
                  </div>
                  <Switch
                    checked={values[key] !== 'false'}
                    onCheckedChange={async (checked) => {
                      const newVal = checked ? 'true' : 'false'
                      setValues((v) => ({ ...v, [key]: newVal }))
                      try {
                        await apiPatch('/api/admin/settings', { [key]: newVal })
                        toast.success(`${label} ${checked ? 'opened' : 'closed'}`)
                      } catch (e: any) {
                        toast.error(e.message || 'Failed to update')
                      }
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Header Builder */}
          <HeaderBuilderCard values={values} setValues={setValues} />

          {/* Platform Settings (legacy) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="tune" size={18} className="text-primary" />
                {t('admin.generalSettings')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {platformFields.map(({ key, label, type }) => (
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
            </CardContent>
          </Card>

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
              {t('common.save')}
            </Button>
          </div>
        </>
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

// ============================================================================
// Header Builder — design two distinct headers (Guest + Logged-in)
// ============================================================================
type HeaderMenuItem = { label: string; link: string }
type HeaderConfig = {
  menuItems: HeaderMenuItem[]
  ctaLabel: string
  ctaLink: string
}

function parseHeaderConfig(json: string | undefined): HeaderConfig {
  const defaults: HeaderConfig = { menuItems: [], ctaLabel: '', ctaLink: '' }
  if (!json) return defaults
  try {
    const parsed = JSON.parse(json)
    return {
      menuItems: Array.isArray(parsed.menuItems) ? parsed.menuItems : [],
      ctaLabel: parsed.ctaLabel || '',
      ctaLink: parsed.ctaLink || '',
    }
  } catch {
    return defaults
  }
}

function HeaderBuilderCard({ values, setValues }: {
  values: Record<string, string>
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const { t } = useT()
  const [saving, setSaving] = React.useState(false)

  const guestConfig = parseHeaderConfig(values.headerConfigGuest)
  const loggedConfig = parseHeaderConfig(values.headerConfigLogged)

  function updateConfig(key: 'headerConfigGuest' | 'headerConfigLogged', config: HeaderConfig) {
    setValues((v) => ({ ...v, [key]: JSON.stringify(config) }))
  }

  function addMenuItem(key: 'headerConfigGuest' | 'headerConfigLogged') {
    const config = key === 'headerConfigGuest' ? guestConfig : loggedConfig
    updateConfig(key, { ...config, menuItems: [...config.menuItems, { label: '', link: '' }] })
  }

  function removeMenuItem(key: 'headerConfigGuest' | 'headerConfigLogged', index: number) {
    const config = key === 'headerConfigGuest' ? guestConfig : loggedConfig
    updateConfig(key, { ...config, menuItems: config.menuItems.filter((_, i) => i !== index) })
  }

  function updateMenuItem(key: 'headerConfigGuest' | 'headerConfigLogged', index: number, field: 'label' | 'link', value: string) {
    const config = key === 'headerConfigGuest' ? guestConfig : loggedConfig
    const items = [...config.menuItems]
    items[index] = { ...items[index], [field]: value }
    updateConfig(key, { ...config, menuItems: items })
  }

  async function saveHeaders() {
    setSaving(true)
    try {
      await apiPatch('/api/admin/settings', {
        headerConfigGuest: values.headerConfigGuest || JSON.stringify({ menuItems: [], ctaLabel: '', ctaLink: '' }),
        headerConfigLogged: values.headerConfigLogged || JSON.stringify({ menuItems: [], ctaLabel: '', ctaLink: '' }),
      })
      toast.success('Header configuration saved')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save headers')
    } finally {
      setSaving(false)
    }
  }

  function renderHeaderEditor(title: string, icon: string, configKey: 'headerConfigGuest' | 'headerConfigLogged', config: HeaderConfig) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon name={icon} size={16} className="text-primary" />
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>

        {/* Menu items */}
        <div className="space-y-2">
          {config.menuItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Label (e.g. Doctors)"
                value={item.label}
                onChange={(e) => updateMenuItem(configKey, i, 'label', e.target.value)}
                className="h-8 flex-1 text-sm"
              />
              <Input
                placeholder="/en/doctors"
                value={item.link}
                onChange={(e) => updateMenuItem(configKey, i, 'link', e.target.value)}
                className="h-8 flex-1 text-sm font-mono"
              />
              <Button size="sm" variant="ghost" onClick={() => removeMenuItem(configKey, i)} className="size-8 p-0 text-error">
                <Icon name="close" size={14} />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => addMenuItem(configKey)} className="gap-1.5 text-xs">
            <Icon name="add" size={14} />
            Add Menu Item
          </Button>
        </div>

        {/* CTA Button */}
        <div className="space-y-1.5 rounded-[10px] border border-divider p-3">
          <p className="text-xs font-medium text-muted-foreground">Primary CTA Button</p>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Label (e.g. Login)"
              value={config.ctaLabel}
              onChange={(e) => updateConfig(configKey, { ...config, ctaLabel: e.target.value })}
              className="h-8 flex-1 text-sm"
            />
            <Input
              placeholder="/dashboard"
              value={config.ctaLink}
              onChange={(e) => updateConfig(configKey, { ...config, ctaLink: e.target.value })}
              className="h-8 flex-1 text-sm font-mono"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon name="view_quilt" size={18} className="text-primary" />
          Header Builder
        </CardTitle>
        <CardDescription>
          Design two distinct headers: one for guests (not logged in) and one for logged-in users. Menu items and CTA buttons are fully customizable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {renderHeaderEditor('Guest Header', 'person_off', 'headerConfigGuest', guestConfig)}
          {renderHeaderEditor('Logged-in Header', 'person', 'headerConfigLogged', loggedConfig)}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveHeaders} disabled={saving} className="gap-2">
            {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
            Save Header Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Locations Management Section
// ============================================================================
function LocationsSection() {
  const { t } = useT()
  const { data, loading, error, refetch } = useApi<{ countries: any[] }>('/api/admin/locations')
  const [selectedCountry, setSelectedCountry] = React.useState<any | null>(null)
  const [cities, setCities] = React.useState<any[]>([])
  const [newCountryName, setNewCountryName] = React.useState('')
  const [newCountryIso, setNewCountryIso] = React.useState('')
  const [newCountryFlag, setNewCountryFlag] = React.useState('')
  const [newCityName, setNewCityName] = React.useState('')

  const countries = data?.countries || []

  React.useEffect(() => {
    if (selectedCountry) {
      fetch(`/api/admin/locations/cities?countryId=${selectedCountry.id}`).then(r => r.json()).then(d => setCities(d.cities || [])).catch(() => setCities([]))
    }
  }, [selectedCountry])

  async function addCountry() {
    if (!newCountryName.trim() || !newCountryIso.trim()) return
    try {
      await apiPost('/api/admin/locations', { name: newCountryName, isoCode: newCountryIso, flag: newCountryFlag || undefined })
      setNewCountryName(''); setNewCountryIso(''); setNewCountryFlag('')
      toast.success('Country added'); refetch()
    } catch (e: any) { toast.error(e.message || 'Failed') }
  }

  async function addCity() {
    if (!newCityName.trim() || !selectedCountry) return
    try {
      await apiPost('/api/admin/locations/cities', { name: newCityName, countryId: selectedCountry.id })
      setNewCityName('')
      toast.success('City added')
      const res = await fetch(`/api/admin/locations/cities?countryId=${selectedCountry.id}`).then(r => r.json())
      setCities(res.cities || [])
      refetch()
    } catch (e: any) { toast.error(e.message || 'Failed') }
  }

  async function deleteCountry(id: string) {
    try { await apiDelete(`/api/admin/locations/${id}`); toast.success('Country deleted'); setSelectedCountry(null); refetch() }
    catch (e: any) { toast.error(e.message || 'Failed') }
  }

  async function deleteCity(id: string) {
    try { await apiDelete(`/api/admin/locations/cities/${id}`); toast.success('City deleted'); setCities(cities.filter(c => c.id !== id)) }
    catch (e: any) { toast.error(e.message || 'Failed') }
  }

  if (loading) return <div><PageHeader title="Locations" icon="public" /><LoadingCard lines={4} /></div>
  if (error) return <Card><CardContent className="p-6 text-error">{error}</CardContent></Card>

  return (
    <div className="space-y-6">
      <PageHeader title="Locations" description="Manage countries and cities for provider registration and filtering" icon="public" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Countries */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon name="flag" size={18} className="text-primary" />Countries ({countries.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Name" value={newCountryName} onChange={(e) => setNewCountryName(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="ISO (e.g. TR)" value={newCountryIso} onChange={(e) => setNewCountryIso(e.target.value)} maxLength={2} className="h-8 w-20 text-sm uppercase" />
              <Input placeholder="🇹🇷" value={newCountryFlag} onChange={(e) => setNewCountryFlag(e.target.value)} className="h-8 w-12 text-sm" />
              <Button size="sm" onClick={addCountry} className="gap-1"><Icon name="add" size={14} /></Button>
            </div>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {countries.map((c) => (
                <div key={c.id} className={cn('flex items-center justify-between rounded-[10px] border p-2.5 cursor-pointer transition-colors', selectedCountry?.id === c.id ? 'border-primary bg-accent' : 'border-divider hover:bg-surface-secondary')} onClick={() => setSelectedCountry(c)}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{c.flag || '🌍'}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.isoCode} · {c.cities?.length || 0} cities</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteCountry(c.id) }} className="text-error"><Icon name="delete" size={14} /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cities */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon name="location_city" size={18} className="text-primary" />Cities {selectedCountry ? `· ${selectedCountry.name}` : ''}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!selectedCountry ? (
              <p className="text-sm text-muted-foreground text-center py-8">Select a country to manage its cities</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input placeholder="City name" value={newCityName} onChange={(e) => setNewCityName(e.target.value)} className="h-8 text-sm" />
                  <Button size="sm" onClick={addCity} className="gap-1"><Icon name="add" size={14} /></Button>
                </div>
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {cities.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-[10px] border border-divider p-2.5">
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">/{c.slug}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteCity(c.id)} className="text-error"><Icon name="delete" size={14} /></Button>
                    </div>
                  ))}
                  {cities.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No cities yet</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
