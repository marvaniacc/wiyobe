'use client'
import { useState } from 'react'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/hooks/use-t'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { toast } from 'sonner'
import { useRouter as _r } from 'next/navigation'
import { PatientDashboard } from '@/components/dashboards/patient/patient-dashboard'
import { ProviderDashboard } from '@/components/dashboards/provider/provider-dashboard'
import { AdminDashboard } from '@/components/dashboards/admin/admin-dashboard'
import { AffiliateDashboard } from '@/components/dashboards/affiliate/affiliate-dashboard'
import { NotificationBell } from '@/components/shell/notification-bell'
import { SHOW_LEGACY_PROVIDER_TYPES } from '@/lib/feature-flags'
import dynamic from 'next/dynamic'
const PageEditorFullScreen = dynamic(() => import('@/components/admin/full-screen-editors').then(m => m.PageEditorFullScreen), { ssr: false })
const BlogEditorFullScreen = dynamic(() => import('@/components/admin/full-screen-editors').then(m => m.BlogEditorFullScreen), { ssr: false })

type NavItem = { key: string; labelKey: string; icon: string }

const NAV: Record<string, NavItem[]> = {
  PATIENT: [
    { key: 'overview', labelKey: 'dash.overview', icon: 'space_dashboard' },
    { key: 'browse', labelKey: 'dash.browse', icon: 'travel_explore' },
    { key: 'compare', labelKey: 'dash.compare', icon: 'compare' },
    { key: 'favorites', labelKey: 'dash.favorites', icon: 'favorite' },
    { key: 'bookings', labelKey: 'dash.bookings', icon: 'event' },
    // Itineraries: hidden from the sidebar when the legacy flag is OFF.
    // The section itself stays reachable via direct deep-link (?section=
    // itineraries) and remains exactly as-is (currently calls a nonexistent
    // API endpoint) — only its navigation entry is gated.
    ...(SHOW_LEGACY_PROVIDER_TYPES
      ? [{ key: 'itineraries' as const, labelKey: 'dash.itineraries', icon: 'luggage' }]
      : []),
    { key: 'messages', labelKey: 'dash.messages', icon: 'forum' },
    { key: 'documents', labelKey: 'dash.documents', icon: 'folder_shared' },
    { key: 'recycle-bin', labelKey: 'admin.recycleBin', icon: 'delete_sweep' },
    { key: 'disputes', labelKey: 'dash.disputes', icon: 'gavel' },
    { key: 'reviews', labelKey: 'dash.reviews', icon: 'reviews' },
    { key: 'tickets', labelKey: 'dash.tickets', icon: 'support_agent' },
    { key: 'profile', labelKey: 'dash.profile', icon: 'account_circle' },
  ],
  DOCTOR: [
    { key: 'overview', labelKey: 'dash.overview', icon: 'space_dashboard' },
    { key: 'appointments', labelKey: 'dash.appointments', icon: 'event' },
    { key: 'messages', labelKey: 'dash.messages', icon: 'forum' },
    { key: 'services', labelKey: 'dash.services', icon: 'medical_services' },
    { key: 'availability', labelKey: 'dash.availability', icon: 'calendar_month' },
    { key: 'patient-records', labelKey: 'dash.patientRecords', icon: 'folder_shared' },
    { key: 'kyc', labelKey: 'dash.kyc', icon: 'badge' },
    { key: 'reviews', labelKey: 'dash.reviews', icon: 'reviews' },
    { key: 'disputes', labelKey: 'dash.disputes', icon: 'gavel' },
    { key: 'analytics', labelKey: 'dash.analytics', icon: 'analytics' },
    { key: 'payouts', labelKey: 'dash.payouts', icon: 'account_balance' },
    { key: 'profile', labelKey: 'dash.profile', icon: 'account_circle' },
  ],
  HOSPITAL: [
    { key: 'overview', labelKey: 'dash.overview', icon: 'space_dashboard' },
    { key: 'appointments', labelKey: 'dash.appointments', icon: 'event' },
    { key: 'messages', labelKey: 'dash.messages', icon: 'forum' },
    { key: 'services', labelKey: 'dash.services', icon: 'local_hospital' },
    { key: 'availability', labelKey: 'dash.availability', icon: 'calendar_month' },
    { key: 'reviews', labelKey: 'dash.reviews', icon: 'reviews' },
    { key: 'disputes', labelKey: 'dash.disputes', icon: 'gavel' },
    { key: 'analytics', labelKey: 'dash.analytics', icon: 'analytics' },
    { key: 'payouts', labelKey: 'dash.payouts', icon: 'account_balance' },
    { key: 'profile', labelKey: 'dash.profile', icon: 'account_circle' },
  ],
  HOTEL: [
    { key: 'overview', labelKey: 'dash.overview', icon: 'space_dashboard' },
    { key: 'bookings', labelKey: 'dash.bookings', icon: 'event' },
    { key: 'messages', labelKey: 'dash.messages', icon: 'forum' },
    { key: 'services', labelKey: 'dash.services', icon: 'hotel' },
    { key: 'reviews', labelKey: 'dash.reviews', icon: 'reviews' },
    { key: 'disputes', labelKey: 'dash.disputes', icon: 'gavel' },
    { key: 'analytics', labelKey: 'dash.analytics', icon: 'analytics' },
    { key: 'payouts', labelKey: 'dash.payouts', icon: 'account_balance' },
    { key: 'profile', labelKey: 'dash.profile', icon: 'account_circle' },
  ],
  TRANSLATOR: [
    { key: 'overview', labelKey: 'dash.overview', icon: 'space_dashboard' },
    { key: 'appointments', labelKey: 'dash.appointments', icon: 'event' },
    { key: 'messages', labelKey: 'dash.messages', icon: 'forum' },
    { key: 'services', labelKey: 'dash.services', icon: 'translate' },
    { key: 'availability', labelKey: 'dash.availability', icon: 'calendar_month' },
    { key: 'reviews', labelKey: 'dash.reviews', icon: 'reviews' },
    { key: 'analytics', labelKey: 'dash.analytics', icon: 'analytics' },
    { key: 'payouts', labelKey: 'dash.payouts', icon: 'account_balance' },
    { key: 'profile', labelKey: 'dash.profile', icon: 'account_circle' },
  ],
  ADMIN: [
    // Kept for fallback/effectiveNav — admin uses ADMIN_NAV_GROUPS below
    { key: 'overview', labelKey: 'dash.overview', icon: 'space_dashboard' },
    { key: 'profile', labelKey: 'dash.profile', icon: 'account_circle' },
  ],
  AFFILIATE: [
    { key: 'overview', labelKey: 'dash.affiliateOverview', icon: 'space_dashboard' },
    { key: 'referrals', labelKey: 'dash.referrals', icon: 'ads_click' },
    { key: 'analytics', labelKey: 'dash.affiliateAnalytics', icon: 'analytics' },
    { key: 'materials', labelKey: 'dash.affiliateMaterials', icon: 'campaign' },
    { key: 'payouts', labelKey: 'dash.affiliatePayouts', icon: 'account_balance' },
    { key: 'profile', labelKey: 'dash.affiliateProfile', icon: 'account_circle' },
  ],
}

const ROLE_LABEL_KEY: Record<string, string> = {
  PATIENT: 'role.patient', DOCTOR: 'role.doctor', HOSPITAL: 'role.hospital', HOTEL: 'role.hotel', TRANSLATOR: 'role.translator', ADMIN: 'role.admin', AFFILIATE: 'role.affiliate',
}

// ============================================================================
// Admin sidebar — 9 accordion groups
// ============================================================================
type NavGroup = { groupKey: string; labelKey: string; icon: string; items: NavItem[] }

const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'dashboard', labelKey: 'nav.dashboard', icon: 'space_dashboard',
    items: [
      { key: 'overview', labelKey: 'dash.overview', icon: 'space_dashboard' },
      { key: 'analytics', labelKey: 'dash.analytics', icon: 'monitoring' },
      { key: 'reports', labelKey: 'dash.reports', icon: 'analytics' },
    ],
  },
  {
    groupKey: 'bookings', labelKey: 'nav.bookings', icon: 'event_available',
    items: [
      { key: 'bookings', labelKey: 'dash.bookings', icon: 'event_available' },
      { key: 'disputes', labelKey: 'dash.disputes', icon: 'gavel' },
      { key: 'cancellations', labelKey: 'dash.cancellations', icon: 'cancel_schedule_send' },
    ],
  },
  {
    groupKey: 'providers', labelKey: 'nav.providers', icon: 'verified',
    items: [
      { key: 'providers', labelKey: 'dash.providers', icon: 'verified' },
      { key: 'services', labelKey: 'admin.services', icon: 'medical_services' },
      { key: 'kyc-review', labelKey: 'admin.kycReview', icon: 'fact_check' },
      { key: 'kyc-requirements', labelKey: 'admin.kycRequirements', icon: 'verified_user' },
    ],
  },
  {
    groupKey: 'users', labelKey: 'nav.users', icon: 'group',
    items: [
      { key: 'users', labelKey: 'dash.users', icon: 'group' },
      { key: 'broadcast', labelKey: 'admin.broadcast', icon: 'campaign' },
    ],
  },
  {
    groupKey: 'affiliates', labelKey: 'nav.affiliates', icon: 'campaign',
    items: [
      { key: 'affiliates', labelKey: 'admin.affiliates', icon: 'campaign' },
      { key: 'affiliate-rates', labelKey: 'admin.affiliateRates', icon: 'percent' },
    ],
  },
  {
    groupKey: 'finance', labelKey: 'nav.finance', icon: 'account_balance',
    items: [
      { key: 'commission', labelKey: 'dash.commission', icon: 'percent' },
      { key: 'payouts', labelKey: 'dash.payouts', icon: 'account_balance' },
      { key: 'ledger', labelKey: 'dash.ledger', icon: 'receipt_long' },
      { key: 'promo-codes', labelKey: 'admin.promoCodes', icon: 'local_offer' },
    ],
  },
  {
    groupKey: 'content', labelKey: 'nav.content', icon: 'article',
    items: [
      { key: 'blog', labelKey: 'admin.blogPosts', icon: 'article' },
      { key: 'custom-pages', labelKey: 'admin.customPages', icon: 'web' },
      { key: 'shortcodes', labelKey: 'admin.shortcodes', icon: 'code_blocks' },
      { key: 'media-library', labelKey: 'admin.mediaLibrary', icon: 'perm_media' },
      { key: 'tags', labelKey: 'dash.tags', icon: 'sell' },
      { key: 'locations', labelKey: 'dash.locations', icon: 'public' },
    ],
  },
  {
    groupKey: 'support', labelKey: 'nav.support', icon: 'support_agent',
    items: [
      { key: 'tickets', labelKey: 'admin.tickets', icon: 'support_agent' },
      { key: 'messages', labelKey: 'dash.messages', icon: 'forum' },
    ],
  },
  {
    groupKey: 'settings', labelKey: 'nav.settings', icon: 'settings',
    items: [
      { key: 'settings', labelKey: 'dash.settings', icon: 'settings' },
      { key: 'recycle-bin', labelKey: 'admin.recycleBin', icon: 'delete_sweep' },
      { key: 'profile', labelKey: 'dash.profile', icon: 'account_circle' },
    ],
  },
]

// Map each admin section to its parent group for auto-expand
const ADMIN_SECTION_TO_GROUP: Record<string, string> = {}
for (const g of ADMIN_NAV_GROUPS) {
  for (const item of g.items) {
    ADMIN_SECTION_TO_GROUP[item.key] = g.groupKey
  }
}

export function DashboardShell() {
  const session = useApp((s) => s.session)!
  const view = useApp((s) => s.view)
  const goDashboard = useApp((s) => s.goDashboard)
  const signOut = useApp((s) => s.signOut)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const compareIds = useApp((s) => s.compareIds)
  const { t, dir } = useT()

  const section = view.name === 'dashboard' ? view.section : 'overview'
  const nav = NAV[session.role] || []
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeNavGroup = useApp((s) => s.activeNavGroup)
  const setActiveNavGroup = useApp((s) => s.setActiveNavGroup)

  const isAdmin = session.role === 'ADMIN'
  // Auto-expand the group containing the current section
  const currentGroup = isAdmin ? (ADMIN_SECTION_TO_GROUP[section] || 'dashboard') : null
  const expandedGroup = activeNavGroup || currentGroup

  // KYC lock: providers whose kycStatus is not APPROVED can only access
  // 'kyc' and 'profile' sections. All other nav items are hidden, and
  // attempting to access a locked section redirects to 'kyc'.
  const isProvider = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'].includes(session.role)
  const kycLocked = isProvider && session.kycStatus !== 'APPROVED'
  const ALLOWED_WHEN_LOCKED = new Set(['kyc', 'profile'])
  const effectiveSection = kycLocked && !ALLOWED_WHEN_LOCKED.has(section) ? 'kyc' : section
  const effectiveNav = kycLocked ? nav.filter((item) => ALLOWED_WHEN_LOCKED.has(item.key)) : nav

  const initials = (session.name || session.email).split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  async function handleSignOut() {
    try { await fetch('/api/auth/signout', { method: 'POST' }) } catch {}
    signOut()
    toast.success('Signed out')
    // Direct redirect to /en — avoids the clunky spinner → redirect UX
    window.location.href = '/en'
  }

  const isFullScreenEditor = section === 'page-editor' || section === 'blog-editor'

  if (isFullScreenEditor && session.role === 'ADMIN') {
    return (
      <div className="flex h-screen w-full flex-col bg-background" dir={dir}>
        {section === 'page-editor' && <PageEditorFullScreen />}
        {section === 'blog-editor' && <BlogEditorFullScreen />}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background" dir={dir}>
      {/* Sidebar — icon rail by default, expands on hover (desktop) */}
      <aside
        className={cn(
codex/-ux-n0jt0m
          'group fixed inset-y-0 start-0 z-40 flex w-0 -translate-x-full overflow-hidden border-e border-divider bg-sidebar transition-[width,transform] duration-200 ease-out',
          'lg:w-[68px] lg:translate-x-0 lg:overflow-visible lg:hover:w-[248px]',
          mobileOpen && 'w-[248px] translate-x-0'

          'group fixed inset-y-0 start-0 z-40 flex w-[248px] -translate-x-full flex-col border-e border-divider bg-sidebar transition-[width,transform] duration-200 ease-out',
          'lg:w-[68px] lg:translate-x-0 lg:hover:w-[248px]',
          mobileOpen && 'translate-x-0'
main
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <Icon name="monitor_heart" size={20} fill />
          </div>
          <span className="overflow-hidden whitespace-nowrap text-lg font-semibold text-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 [.w-\[248px\]_&]:opacity-100">
            {t('brand.name')}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {isAdmin ? (
            /* Admin: 9 accordion groups */
            <ul className="flex flex-col gap-0.5">
              {ADMIN_NAV_GROUPS.map((group) => {
                const isExpanded = expandedGroup === group.groupKey
                const hasActive = group.items.some((item) => effectiveSection === item.key)
                return (
                  <li key={group.groupKey}>
                    <button
                      onClick={() => setActiveNavGroup(isExpanded ? null : group.groupKey)}
                      title={t(group.labelKey)}
                      className={cn(
                        'flex w-full items-center justify-center rounded-[10px] py-2.5 text-sm font-medium transition-colors group-hover:justify-start group-hover:gap-3 group-hover:px-3 [.w-\[248px\]_&]:justify-start [.w-\[248px\]_&]:gap-3 [.w-\[248px\]_&]:px-3',
                        hasActive ? 'text-foreground' : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                      )}
                    >
                      <Icon name={group.icon} size={20} fill={hasActive} className="shrink-0" />
                      <span className="hidden flex-1 truncate text-start group-hover:block [.w-\[248px\]_&]:block">
                        {t(group.labelKey)}
                      </span>
                      <Icon name="expand_more" size={16} className={cn('hidden shrink-0 group-hover:block [.w-\[248px\]_&]:block', isExpanded && 'rotate-180')} />
                    </button>
                    {isExpanded && (
                      <ul className="ms-3 flex flex-col gap-0.5 border-s border-divider ps-2 pt-0.5">
                        {group.items.map((item) => {
                          const active = effectiveSection === item.key
                          return (
                            <li key={item.key}>
                              <button
                                onClick={() => { goDashboard(item.key); setMobileOpen(false) }}
                                title={t(item.labelKey)}
                                className={cn(
                                  'flex w-full items-center justify-center rounded-[8px] py-2 text-[13px] font-medium transition-colors group-hover:justify-start group-hover:gap-2.5 group-hover:px-2.5 [.w-\[248px\]_&]:justify-start [.w-\[248px\]_&]:gap-2.5 [.w-\[248px\]_&]:px-2.5',
                                  active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                                )}
                              >
                                <Icon name={item.icon} size={16} fill={active} className="shrink-0" />
                                <span className="hidden truncate group-hover:block [.w-\[248px\]_&]:block">
                                  {t(item.labelKey)}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            /* Non-admin: flat list */
            <ul className="flex flex-col gap-1">
              {effectiveNav.map((item) => {
                const active = effectiveSection === item.key
                return (
                  <li key={item.key}>
                    <button
                      onClick={() => { goDashboard(item.key); setMobileOpen(false) }}
                      title={t(item.labelKey)}
                      className={cn(
                        'flex w-full items-center justify-center rounded-[10px] py-2.5 text-sm font-medium transition-colors group-hover:justify-start group-hover:gap-3 group-hover:px-3 [.w-\[248px\]_&]:justify-start [.w-\[248px\]_&]:gap-3 [.w-\[248px\]_&]:px-3',
                        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                      )}
                    >
                      <Icon name={item.icon} size={20} fill={active} className="shrink-0" />
                      <span className="hidden flex-1 truncate text-start group-hover:block [.w-\[248px\]_&]:block">
                        {t(item.labelKey)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        {/* User mini at bottom */}
        <div className="border-t border-divider p-3">
          <button
            onClick={handleSignOut}
            title={t('common.signout')}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
          >
            <Icon name="logout" size={22} className="shrink-0" />
            <span className="overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100 [.w-\[248px\]_&]:opacity-100">
              {t('common.signout')}
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:ps-[68px]">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-divider bg-surface/80 px-4 backdrop-blur-md md:px-6">
          <button
            className="lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? t('common.close') : t('common.menu', 'Open navigation menu')}
            aria-expanded={mobileOpen}
          >
            <Icon name="menu" size={24} />
          </button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{t('dash.dashboard')}</span>
            <Icon name="chevron_right" size={16} className="hidden sm:inline rtl:rotate-180" />
            <span className="font-medium text-foreground">{t(NAV[session.role]?.find((n) => n.key === effectiveSection)?.labelKey || 'dash.overview')}</span>
          </div>

          <div className="ms-auto flex items-center gap-1.5">
            {compareIds.length > 0 && session.role === 'PATIENT' && (
              <Button size="sm" variant="outline" onClick={() => goDashboard('compare')} className="gap-1.5">
                <Icon name="compare" size={16} />
                {compareIds.length}
              </Button>
            )}

            {/* Notifications */}
            <NotificationBell />

            {/* Language */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" title={t('common.language')}>
                  <Icon name="translate" size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {LOCALES.map((l) => (
                  <DropdownMenuItem key={l} onClick={() => setLocale(l as Locale)} className={cn(locale === l && 'bg-accent')}>
                    <span className="text-base">{LOCALE_META[l].flag}</span>
                    <span>{LOCALE_META[l].native}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme */}
            <Button size="icon" variant="ghost" onClick={toggleTheme} title="Theme">
              <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size={20} />
            </Button>

            {/* User */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-1 pe-2 transition-colors hover:bg-surface-secondary">
                  <Avatar className="size-8">
                    {session.avatarUrl && <AvatarImage src={session.avatarUrl} alt={session.name || 'Avatar'} />}
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium md:inline">{session.name?.split(' ')[0]}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{session.name}</span>
                    <span className="text-xs text-muted-foreground">{session.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs text-muted-foreground">{t(ROLE_LABEL_KEY[session.role] || 'role.patient')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => goDashboard('profile')} className="gap-2">
                  <Icon name="account_circle" size={18} /> {t('dash.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-error">
                  <Icon name="logout" size={18} /> {t('common.signout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          {/* KYC lock warning banner */}
          {kycLocked && (
            <div className="mb-4 flex items-center gap-3 rounded-[14px] border border-warning/30 bg-warning/5 p-4">
              <Icon name="lock" size={20} className="shrink-0 text-warning" fill />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{t('provider.kycLocked', 'Account Pending KYC Verification')}</p>
                <p className="text-xs text-muted-foreground">{t('provider.kycWarning', 'Some features are locked until your documents are approved. Please complete your KYC verification.')}</p>
              </div>
              {effectiveSection !== 'kyc' && (
                <Button size="sm" variant="outline" onClick={() => goDashboard('kyc')} className="shrink-0 gap-1.5">
                  <Icon name="badge" size={16} />
                  {t('provider.kycVerification', 'Verify Now')}
                </Button>
              )}
            </div>
          )}
          {session.role === 'PATIENT' && <PatientDashboard section={effectiveSection} />}
          {(session.role === 'DOCTOR' || session.role === 'HOSPITAL' || session.role === 'HOTEL' || session.role === 'TRANSLATOR') && (
            <ProviderDashboard section={effectiveSection} role={session.role} />
          )}
          {session.role === 'ADMIN' && <AdminDashboard section={section} />}
          {session.role === 'AFFILIATE' && <AffiliateDashboard section={section} />}
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-divider bg-surface px-6 py-4 text-center text-xs text-muted-foreground">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <span>© {new Date().getFullYear()} {t('brand.name')}. {t('footer.rights')}</span>
            <div className="flex gap-4">
              <a href={`/${locale}/privacy`} className="transition-colors hover:text-foreground">{t('footer.privacy')}</a>
              <a href={`/${locale}/terms`} className="transition-colors hover:text-foreground">{t('footer.terms')}</a>
              <a href="#" className="transition-colors hover:text-foreground" onClick={(e) => { e.preventDefault(); goDashboard('tickets') }}>{t('footer.support')}</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
