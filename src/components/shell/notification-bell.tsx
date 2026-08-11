'use client'
import { useState, useRef, useEffect } from 'react'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { useApi, apiPost, apiPatch } from '@/hooks/use-api'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/money'
import { toast } from 'sonner'

// Category-based icon + color mapping (uses the new `category` field,
// with fallback to the legacy `type` field for backward compat).
const CATEGORY_ICON: Record<string, string> = {
  BOOKING: 'event_available',
  KYC: 'badge',
  CHAT: 'forum',
  SYSTEM: 'settings',
  ANNOUNCEMENT: 'campaign',
  PAYOUT: 'payments',
  REVIEW: 'reviews',
  MEDICAL: 'medical_information',
  PROMO: 'local_offer',
}

const CATEGORY_COLOR: Record<string, string> = {
  BOOKING: 'bg-primary/10 text-primary',
  KYC: 'bg-warning/10 text-warning',
  CHAT: 'bg-info/10 text-info',
  SYSTEM: 'bg-surface-secondary text-muted-foreground',
  ANNOUNCEMENT: 'bg-[#9334E6]/10 text-[#9334E6]',
  PAYOUT: 'bg-success/10 text-success',
  REVIEW: 'bg-warning/10 text-warning',
  MEDICAL: 'bg-error/10 text-error',
  PROMO: 'bg-info/10 text-info',
}

// Legacy type-based fallback (for notifications created before the upgrade)
const TYPE_ICON: Record<string, string> = {
  booking_created: 'event_available',
  booking_accepted: 'check_circle',
  booking_declined: 'cancel',
  booking_cancelled: 'event_busy',
  booking_completed: 'task_alt',
  booking_no_show: 'person_off',
  chat_message: 'forum',
  payout_sent: 'payments',
  review_received: 'reviews',
  system: 'campaign',
}

export function NotificationBell() {
  const { t, locale } = useT()
  const goDashboard = useApp((s) => s.goDashboard)
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data, loading, refetch } = useApi<{ notifications: any[]; unreadCount: number }>('/api/notifications', {
    deps: [open],
  })

  // Auto-seed demo notifications on first load (dev only — never in production)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && data && data.notifications.length === 0 && data.unreadCount === 0) {
      apiPost('/api/notifications/seed').then(() => refetch()).catch(() => {})
    }
  }, [data?.notifications.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await apiPatch('/api/notifications/read-all')
      refetch()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setMarkingAll(false)
    }
  }

  async function markOneRead(id: string) {
    try {
      await apiPatch('/api/notifications/read', { id })
      refetch()
    } catch {}
  }

  function handleNotifClick(n: any) {
    const isRead = n.isRead ?? n.read
    if (!isRead) markOneRead(n.id)
    if (n.link) goDashboard(n.link)
    setOpen(false)
  }

  const notifications = data?.notifications || []
  const unread = data?.unreadCount || 0

  function getIcon(n: any): string {
    return CATEGORY_ICON[n.category] || TYPE_ICON[n.type] || 'notifications'
  }
  function getColor(n: any): string {
    return CATEGORY_COLOR[n.category] || 'bg-surface-secondary text-muted-foreground'
  }
  function isRead(n: any): boolean {
    return n.isRead ?? n.read ?? false
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
        aria-label="Notifications"
      >
        <Icon name="notifications" size={20} />
        {unread > 0 && (
          <span className="absolute end-1 top-1 flex size-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-error-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-12 z-50 w-80 origin-top-right animate-scale-in overflow-hidden rounded-[16px] border border-divider bg-surface shadow-[0_4px_24px_rgba(60,64,67,0.15)] md:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-divider px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="notifications_active" size={18} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">{t('notifications.title')}</span>
              {unread > 0 && (
                <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">{unread} new</span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {markingAll ? <Icon name="progress_activity" size={12} className="animate-spin" /> : <Icon name="done_all" size={14} />}
                {t('notifications.markAllRead', 'Mark all as read')}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="size-9 animate-pulse rounded-full bg-surface-secondary" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-surface-secondary" />
                      <div className="h-2.5 w-full animate-pulse rounded bg-surface-secondary" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary">
                  <Icon name="notifications_off" size={28} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">{t('notifications.empty')}</p>
                <p className="text-xs text-muted-foreground">{t('notifications.emptyDesc')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-divider">
                {notifications.map((n) => {
                  const read = isRead(n)
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleNotifClick(n)}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-secondary',
                          !read && 'bg-primary/[0.03]'
                        )}
                      >
                        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', getColor(n))}>
                          <Icon name={getIcon(n)} size={18} fill />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">{n.title}</p>
                            {!read && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-[11px] text-muted-foreground/70">{relativeTime(n.createdAt, locale)}</p>
                            {n.category && n.category !== 'SYSTEM' && (
                              <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
                                {n.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
