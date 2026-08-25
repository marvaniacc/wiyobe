'use client'
import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { StarRating } from '@/components/shared/star-rating'
import { AvatarUpload } from '@/components/shared/avatar-upload'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost, apiPut, apiDelete } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatCurrency, formatDate, formatDateTime, relativeTime } from '@/lib/money'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

/* =========================================================================
 * Types
 * ======================================================================= */

interface AffiliateData {
  affiliate: {
    id: string
    referralCode: string
    verified: boolean
    website: string | null
    socialMedia: string | null
    description: string | null
    totalClicks: number
    totalSignups: number
    totalBookings: number
    totalEarnings: string
    availableBalance: string
    pendingBalance: string
    paidOut: string
    commissionRate?: string
  }
  user: {
    name: string | null
    email: string
    phone: string | null
    country: string | null
    city: string | null
    preferredLanguage: string
    avatarUrl: string | null
    status: string
  }
}

interface StatsData {
  stats: {
    totalClicks: number
    totalSignups: number
    totalBookings: number
    totalEarnings: string
    availableBalance: string
    pendingBalance: string
    paidOut: string
    conversionRate: number
    bookingRate: number
    verified: boolean
    referralCode: string
  }
  funnel: { clicks: number; signups: number; bookings: number; completed: number }
  recentClicks: any[]
  payouts: any[]
}

const CLICK_STATUS: Record<string, { label: string; cls: string; icon: string }> = {
  CLICKED: { label: 'affiliate.clicks', cls: 'bg-muted text-muted-foreground border-divider', icon: 'ads_click' },
  SIGNED_UP: { label: 'affiliate.signups', cls: 'bg-info/10 text-info border-info/20', icon: 'person_add' },
  BOOKED: { label: 'affiliate.bookings', cls: 'bg-primary/10 text-primary border-primary/20', icon: 'event_available' },
  COMPLETED: { label: 'affiliate.completed', cls: 'bg-success/10 text-success border-success/20', icon: 'task_alt' },
}

/* =========================================================================
 * Main component
 * ======================================================================= */

export function AffiliateDashboard({ section }: { section: string }) {
  switch (section) {
    case 'overview': return <OverviewSection />
    case 'referrals': return <ReferralsSection />
    case 'analytics': return <AnalyticsSection />
    case 'payouts': return <PayoutsSection />
    case 'materials': return <MaterialsSection />
    case 'profile': return <ProfileSection />
    default: return <OverviewSection />
  }
}

/* =========================================================================
 * Section: Promo Materials — banners, copy templates, QR code
 * ======================================================================= */

function MaterialsSection() {
  const { t } = useT()
  const { data } = useApi<StatsData>('/api/affiliate/stats')
  const referralCode = data?.stats.referralCode || ''
  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/?ref=${referralCode}` : ''

  const copyTemplates = [
    {
      title: 'Social media post',
      icon: 'share',
      content: `🏥 Looking for affordable, world-class medical care abroad?\n\nWishubest connects you with verified doctors, hospitals, and translators across Turkey, Iran, and beyond. Compare prices, read reviews, and book online!\n\n👉 Start here: ${referralLink}`,
    },
    {
      title: 'WhatsApp message',
      icon: 'chat',
      content: `Hi! I found this platform that helps you find trusted medical care abroad — doctors, hospitals, hotels, and translators, all in one place. Check it out: ${referralLink}`,
    },
    {
      title: 'Email template',
      icon: 'mail',
      content: `Subject: Trusted Medical Care Abroad — Wishubest\n\nHi [Name],\n\nI wanted to share a platform I've been using called Wishubest. It connects patients with verified doctors, hospitals, and translators for medical tourism.\n\nYou can compare prices, read reviews, and book appointments online. Here's my referral link:\n${referralLink}\n\nBest regards,`,
    },
    {
      title: 'Blog/website embed',
      icon: 'code',
      content: `<a href="${referralLink}" target="_blank" rel="noopener">Wishubest — Global Medical Tourism Marketplace</a>`,
    },
  ]

  function copyTemplate(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'))
  }

  // Generate QR code URL using a public QR code API
  const qrCodeUrl = referralLink ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralLink)}` : ''

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Promo materials</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ready-to-use marketing materials to help you refer more patients</p>
      </div>

      {/* QR Code card */}
      <Card className="gap-0">
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:gap-8">
          {qrCodeUrl && (
            <div className="shrink-0 rounded-[16px] border border-divider bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCodeUrl} alt="QR Code" width={160} height={160} className="rounded-[8px]" />
            </div>
          )}
          <div className="flex-1 text-center sm:text-start">
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Icon name="qr_code" size={20} className="text-primary" />
              Your QR code
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Print this QR code on flyers, business cards, or posters. When scanned, it opens your referral link directly.</p>
            {qrCodeUrl && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 gap-1.5"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = qrCodeUrl
                  a.download = `wishubest-qr-${referralCode}.png`
                  a.target = '_blank'
                  a.click()
                }}
              >
                <Icon name="download" size={14} />
                Download QR
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Copy-paste templates */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {copyTemplates.map((tpl) => (
          <Card key={tpl.title} className="gap-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
                    <Icon name={tpl.icon} size={16} fill />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{tpl.title}</h3>
                </div>
                <Button size="sm" variant="ghost" onClick={() => copyTemplate(tpl.content)} className="gap-1.5">
                  <Icon name="content_copy" size={14} />
                  Copy
                </Button>
              </div>
              <div className="mt-3 rounded-[12px] bg-surface-secondary p-3">
                <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground">{tpl.content}</pre>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Banner preview */}
      <Card className="gap-0">
        <CardHeader>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Icon name="view_carousel" size={18} className="text-primary" />
            Banner preview
          </h3>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-[16px] border border-divider">
            <div className="flex flex-col items-center gap-3 bg-primary p-6 text-center text-primary-foreground sm:flex-row sm:gap-6 sm:text-start">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-primary-foreground/15">
                <Icon name="monitor_heart" size={36} fill />
              </div>
              <div className="flex-1">
                <p className="text-lg font-bold">Wishubest</p>
                <p className="text-sm text-primary-foreground/80">World-class healthcare, anywhere in the world. Compare verified providers and book online.</p>
              </div>
              {referralLink && (
                <a
                  href={referralLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-full bg-primary-foreground px-5 py-2 text-sm font-semibold text-primary transition-all hover:scale-105"
                >
                  Find care now
                </a>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">This is how your referral link appears when shared on social media with link previews.</p>
        </CardContent>
      </Card>
    </div>
  )
}

/* =========================================================================
 * Section: Overview
 * ======================================================================= */

function OverviewSection() {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const { data, loading, error } = useApi<StatsData>('/api/affiliate/stats')

  if (loading) return <OverviewSkeleton t={t} />
  if (error || !data) return <div className="py-10 text-center text-sm text-muted-foreground">{error || t('common.error')}</div>

  const s = data.stats
  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/?ref=${s.referralCode}` : ''

  function copyLink() {
    navigator.clipboard.writeText(referralLink).then(() => toast.success(t('affiliate.linkCopied')))
  }

  const stats = [
    { label: t('affiliate.totalClicks'), value: String(s.totalClicks), icon: 'ads_click', cls: 'bg-primary/10 text-primary' },
    { label: t('affiliate.totalSignups'), value: String(s.totalSignups), icon: 'person_add', cls: 'bg-info/10 text-info' },
    { label: t('affiliate.totalBookings'), value: String(s.totalBookings), icon: 'event_available', cls: 'bg-success/10 text-success' },
    { label: t('affiliate.conversionRate'), value: `${s.conversionRate}%`, icon: 'trending_up', cls: 'bg-warning/10 text-warning' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('affiliate.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('affiliate.desc')}</p>
        </div>
        {s.verified ? (
          <Badge variant="outline" className="rounded-full border-success/20 bg-success/5 text-success">
            <Icon name="verified" size={14} fill />
            {t('affiliate.verified')}
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-full border-warning/20 bg-warning/5 text-warning">
            <Icon name="hourglass_top" size={14} />
            {t('affiliate.pendingApproval')}
          </Badge>
        )}
      </div>

      {/* Referral link card */}
      <Card className="gap-0 border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
              <Icon name="share" size={24} fill />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground">{t('affiliate.shareLink')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('affiliate.shareLinkDesc')}</p>
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={referralLink}
                  readOnly
                  className="flex-1 font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button size="sm" onClick={copyLink} className="gap-1.5 shrink-0">
                  <Icon name="content_copy" size={14} />
                  {t('affiliate.copyLink')}
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Icon name="ticket" size={12} />
                {t('affiliate.referralCode')}: <span className="font-mono font-semibold text-foreground">{s.referralCode}</span>
              </div>

              {/* Social share buttons */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Share:</span>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Find trusted medical care abroad with Wishubest! ${referralLink}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex size-8 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366] transition-all hover:scale-110"
                  title="WhatsApp"
                >
                  <Icon name="chat" size={16} fill />
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Find trusted medical care abroad with Wishubest!')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex size-8 items-center justify-center rounded-full bg-[#0088cc]/10 text-[#0088cc] transition-all hover:scale-110"
                  title="Telegram"
                >
                  <Icon name="send" size={16} fill />
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Find trusted medical care abroad with Wishubest!')}&url=${encodeURIComponent(referralLink)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex size-8 items-center justify-center rounded-full bg-black/5 text-foreground transition-all hover:scale-110"
                  title="X (Twitter)"
                >
                  <Icon name="close" size={16} fill />
                </a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex size-8 items-center justify-center rounded-full bg-[#1877F2]/10 text-[#1877F2] transition-all hover:scale-110"
                  title="Facebook"
                >
                  <Icon name="public" size={16} fill />
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent('Wishubest - Medical Tourism')}&body=${encodeURIComponent(`Find trusted medical care abroad with Wishubest! ${referralLink}`)}`}
                  className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-all hover:scale-110"
                  title="Email"
                >
                  <Icon name="mail" size={16} fill />
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((st) => (
          <Card key={st.label} className="group gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="flex items-start gap-4 p-5">
              <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-[14px] transition-transform group-hover:scale-105', st.cls)}>
                <Icon name={st.icon} size={24} fill />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{st.label}</p>
                <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-foreground">{st.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Earnings + commission info */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="payments" size={18} className="text-success" />
              {t('affiliate.earningsSummary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[14px] border border-success/20 bg-success/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.availableBalance')}</p>
                <p className="mt-1 text-2xl font-bold text-success tabular-nums">{formatCurrency(s.availableBalance, 'USD', locale)}</p>
              </div>
              <div className="rounded-[14px] border border-warning/20 bg-warning/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.pendingBalance')}</p>
                <p className="mt-1 text-2xl font-bold text-warning tabular-nums">{formatCurrency(s.pendingBalance, 'USD', locale)}</p>
              </div>
              <div className="rounded-[14px] border border-divider bg-surface-secondary p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.paidOut')}</p>
                <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{formatCurrency(s.paidOut, 'USD', locale)}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('affiliate.totalEarnings')}</p>
                <p className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(s.totalEarnings, 'USD', locale)}</p>
              </div>
              <div className="text-end">
                <p className="text-sm text-muted-foreground">{t('affiliate.nextPayout')}</p>
                <p className="text-sm font-medium text-foreground">{t('affiliate.monthlyPayouts')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commission info card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="percent" size={18} className="text-primary" />
              {t('affiliate.howItWorks')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[14px] bg-primary/5 p-4">
              <p className="text-sm font-medium text-foreground">{t('affiliate.commissionModel')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('affiliate.commissionModelDesc')}</p>
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Icon name="check_circle" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>{t('affiliate.step1')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="check_circle" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>{t('affiliate.step2')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Icon name="check_circle" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>{t('affiliate.step3')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="filter_funnel" size={18} className="text-primary" />
            {t('affiliate.funnel')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FunnelStep label={t('affiliate.clicks')} value={data.funnel.clicks} icon="ads_click" cls="bg-muted text-muted-foreground" max={data.funnel.clicks} />
            <FunnelStep label={t('affiliate.signups')} value={data.funnel.signups} icon="person_add" cls="bg-info/10 text-info" max={data.funnel.clicks} />
            <FunnelStep label={t('affiliate.bookings')} value={data.funnel.bookings} icon="event_available" cls="bg-primary/10 text-primary" max={data.funnel.clicks} />
            <FunnelStep label={t('affiliate.completed')} value={data.funnel.completed} icon="task_alt" cls="bg-success/10 text-success" max={data.funnel.clicks} />
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      {data.recentClicks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="history" size={18} className="text-primary" />
              {t('affiliate.recentActivity')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentClicks.slice(0, 5).map((c) => {
              const stCfg = CLICK_STATUS[c.status] || CLICK_STATUS.CLICKED
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-[12px] border border-divider p-3">
                  <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-[8px]', stCfg.cls)}>
                    <Icon name={stCfg.icon} size={16} fill />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{c.referredUserName || 'Anonymous visitor'}</p>
                    <p className="text-xs text-muted-foreground">{relativeTime(c.clickedAt, locale)}</p>
                  </div>
                  <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', stCfg.cls)}>
                    {t(stCfg.label)}
                  </span>
                  {c.commissionAmount && parseFloat(c.commissionAmount) > 0 && (
                    <span className="shrink-0 text-sm font-semibold text-success tabular-nums">+{formatCurrency(c.commissionAmount, 'USD', locale)}</span>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FunnelStep({ label, value, icon, cls, max }: { label: string; value: number; icon: string; cls: string; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="rounded-[14px] border border-divider p-4">
      <div className={cn('flex size-9 items-center justify-center rounded-[10px]', cls)}>
        <Icon name={icon} size={18} fill />
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function OverviewSkeleton({ t }: { t: (k: string) => string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-32 w-full rounded-[16px]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`item-${i}`} className="h-24 rounded-[16px]" />)}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-48 rounded-[16px] lg:col-span-2" />
        <Skeleton className="h-48 rounded-[16px]" />
      </div>
    </div>
  )
}

/* =========================================================================
 * Section: Referrals
 * ======================================================================= */

function ReferralsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ clicks: any[] }>('/api/affiliate/clicks')

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">{t('affiliate.referrals')}</h1>
        <Skeleton className="h-96 rounded-[16px]" />
      </div>
    )
  }
  if (error) return <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>

  const clicks = data?.clicks || []

  if (clicks.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">{t('affiliate.referrals')}</h1>
        <Card className="gap-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-16 items-center justify-center rounded-[20px] bg-surface-secondary text-muted-foreground">
              <Icon name="ads_click" size={32} />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{t('affiliate.noReferrals')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('affiliate.noReferralsDesc')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('affiliate.referrals')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('affiliate.referralsDesc')}</p>
      </div>

      {/* Desktop table */}
      <Card className="hidden gap-0 md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-4 text-xs uppercase tracking-wide text-muted-foreground">{t('affiliate.status')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">User</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('affiliate.clickedAt')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t('affiliate.convertedAt')}</TableHead>
                <TableHead className="pe-4 text-end text-xs uppercase tracking-wide text-muted-foreground">{t('affiliate.commission')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clicks.map((c) => {
                const stCfg = CLICK_STATUS[c.status] || CLICK_STATUS.CLICKED
                return (
                  <TableRow key={c.id} className="border-divider">
                    <TableCell className="ps-4">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', stCfg.cls)}>
                        <Icon name={stCfg.icon} size={10} fill />
                        {t(stCfg.label)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">{c.referredUserName || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{relativeTime(c.clickedAt, locale)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.convertedAt ? relativeTime(c.convertedAt, locale) : '—'}</TableCell>
                    <TableCell className="pe-4 text-end text-sm font-semibold text-success tabular-nums">
                      {c.commissionAmount && parseFloat(c.commissionAmount) > 0 ? '+' + formatCurrency(c.commissionAmount, 'USD', locale) : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {clicks.map((c) => {
          const stCfg = CLICK_STATUS[c.status] || CLICK_STATUS.CLICKED
          return (
            <Card key={c.id} className="gap-0">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-[10px]', stCfg.cls)}>
                    <Icon name={stCfg.icon} size={20} fill />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{c.referredUserName || 'Anonymous'}</p>
                      <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', stCfg.cls)}>
                        {t(stCfg.label)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(c.clickedAt, locale)}</p>
                    {c.commissionAmount && parseFloat(c.commissionAmount) > 0 && (
                      <p className="mt-1 text-sm font-semibold text-success">+{formatCurrency(c.commissionAmount, 'USD', locale)}</p>
                    )}
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
 * Section: Analytics
 * ======================================================================= */

function AnalyticsSection() {
  const { t, locale } = useT()
  const { data, loading, error } = useApi<StatsData>('/api/affiliate/stats')

  if (loading) return <OverviewSkeleton t={t} />
  if (error || !data) return <div className="py-10 text-center text-sm text-muted-foreground">{error || t('common.error')}</div>

  const s = data.stats

  const funnelData = [
    { stage: t('affiliate.clicks'), value: data.funnel.clicks, fill: '#9AA0A6' },
    { stage: t('affiliate.signups'), value: data.funnel.signups, fill: '#4285F4' },
    { stage: t('affiliate.bookings'), value: data.funnel.bookings, fill: '#1A73E8' },
    { stage: t('affiliate.completed'), value: data.funnel.completed, fill: '#188038' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('dash.affiliateAnalytics')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('affiliate.desc')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="group gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <Icon name="ads_click" size={24} fill />
            </div>
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.totalClicks')}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{s.totalClicks}</p></div>
          </CardContent>
        </Card>
        <Card className="group gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-info/10 text-info transition-transform group-hover:scale-105">
              <Icon name="person_add" size={24} fill />
            </div>
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.conversionRate')}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{s.conversionRate}%</p></div>
          </CardContent>
        </Card>
        <Card className="group gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-success/10 text-success transition-transform group-hover:scale-105">
              <Icon name="event_available" size={24} fill />
            </div>
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.bookingRate')}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{s.bookingRate}%</p></div>
          </CardContent>
        </Card>
        <Card className="group gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-warning/10 text-warning transition-transform group-hover:scale-105">
              <Icon name="payments" size={24} fill />
            </div>
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.totalEarnings')}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(s.totalEarnings, 'USD', locale)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="filter_funnel" size={18} className="text-primary" />
            {t('affiliate.funnel')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EAED" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={{ stroke: '#DADCE0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#5F6368' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip cursor={{ fill: '#F1F3F4' }} contentStyle={{ borderRadius: 12, border: '1px solid #DADCE0', fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {funnelData.map((d, i) => <Cell key={`cell-${i}`} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Need Cell import for the funnel chart
import { Cell } from 'recharts'

/* =========================================================================
 * Section: Payouts
 * ======================================================================= */

function PayoutsSection() {
  const { t, locale } = useT()
  const { data, loading, error } = useApi<{ payouts: any[]; balance: any }>('/api/affiliate/payouts')

  if (loading) return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{t('affiliate.payouts')}</h1>
      <Skeleton className="h-96 rounded-[16px]" />
    </div>
  )
  if (error) return <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>

  const payouts = data?.payouts || []
  const balance = data?.balance || { available: '0', pending: '0', paidOut: '0', totalEarnings: '0' }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('affiliate.payouts')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('affiliate.payoutsDesc')}</p>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 border-success/20"><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.availableBalance')}</p><p className="mt-1 text-2xl font-bold text-success tabular-nums">{formatCurrency(balance.available, 'USD', locale)}</p></CardContent></Card>
        <Card className="gap-0 border-warning/20"><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.pendingBalance')}</p><p className="mt-1 text-2xl font-bold text-warning tabular-nums">{formatCurrency(balance.pending, 'USD', locale)}</p></CardContent></Card>
        <Card className="gap-0"><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.paidOut')}</p><p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{formatCurrency(balance.paidOut, 'USD', locale)}</p></CardContent></Card>
        <Card className="gap-0"><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('affiliate.totalEarnings')}</p><p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{formatCurrency(balance.totalEarnings, 'USD', locale)}</p></CardContent></Card>
      </div>

      {/* Payout history */}
      {payouts.length === 0 ? (
        <Card className="gap-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-16 items-center justify-center rounded-[20px] bg-surface-secondary text-muted-foreground">
              <Icon name="account_balance" size={32} />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{t('affiliate.noPayouts')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('affiliate.noPayoutsDesc')}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-4 text-xs uppercase tracking-wide text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Period</TableHead>
                  <TableHead className="text-end text-xs uppercase tracking-wide text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Status</TableHead>
                  <TableHead className="pe-4 text-xs uppercase tracking-wide text-muted-foreground">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id} className="border-divider">
                    <TableCell className="ps-4 text-sm text-muted-foreground">{formatDate(p.createdAt, locale)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(p.periodStart, locale)} - {formatDate(p.periodEnd, locale)}</TableCell>
                    <TableCell className="text-end text-sm font-semibold text-foreground tabular-nums">{formatCurrency(p.amount, 'USD', locale)}</TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', p.status === 'COMPLETED' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20')}>
                        {p.status}
                      </span>
                    </TableCell>
                    <TableCell className="pe-4 text-sm text-muted-foreground">{p.reference || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* =========================================================================
 * Section: Profile
 * ======================================================================= */

function ProfileSection() {
  const { t } = useT()
  const { data, loading, error, refetch } = useApi<AffiliateData>('/api/affiliate/profile')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    if (data) {
      setForm({
        name: data.user.name || '',
        phone: data.user.phone || '',
        country: data.user.country || '',
        city: data.user.city || '',
        preferredLanguage: data.user.preferredLanguage || 'en',
        website: data.affiliate?.website || '',
        socialMedia: data.affiliate?.socialMedia || '',
        description: data.affiliate?.description || '',
      })
    }
  }, [data])

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      await apiPut('/api/affiliate/profile', form)
      toast.success(t('affiliate.profileUpdated'))
      refetch()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-10"><Skeleton className="h-96 rounded-[16px]" /></div>
  if (error || !data) return <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('dash.affiliateProfile')}</h1>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
          {t('common.save')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Summary card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <AvatarUpload initialAvatarUrl={data.user.avatarUrl} name={form.name || data.user.email} size={96} onUpdated={() => refetch()} />
            <div>
              <p className="text-base font-semibold text-foreground">{form.name || data.user.email}</p>
              <p className="text-sm text-muted-foreground">{data.user.email}</p>
            </div>
            {data.affiliate?.verified ? (
              <Badge variant="outline" className="rounded-full border-success/20 bg-success/5 text-success">
                <Icon name="verified" size={12} fill />
                {t('affiliate.verified')}
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-full border-warning/20 bg-warning/5 text-warning">
                <Icon name="hourglass_top" size={12} />
                {t('affiliate.pendingApproval')}
              </Badge>
            )}
            <div className="w-full rounded-[14px] bg-surface-secondary p-3 text-start">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('affiliate.referralCode')}</span>
                <span className="font-mono text-sm font-bold text-foreground">{data.affiliate?.referralCode}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="account_circle" size={18} className="text-primary" fill />
              {t('provider.commonFields')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('common.name')}</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('common.phone')}</Label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+1..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('common.country')}</Label>
              <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('common.city')}</Label>
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('common.language')}</Label>
              <Select value={form.preferredLanguage} onValueChange={(v) => set('preferredLanguage', v)}>
                <SelectTrigger className="h-12 w-full rounded-[14px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="tr">Türkçe</SelectItem>
                  <SelectItem value="fa">فارسی</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('affiliate.website')}</Label>
              <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('affiliate.socialMedia')}</Label>
              <Input value={form.socialMedia} onChange={(e) => set('socialMedia', e.target.value)} placeholder="@username" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm font-medium">{t('affiliate.description')}</Label>
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Tell us about your audience and marketing channels..." rows={3} className="resize-none" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
