'use client'

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/stores/app-store'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useApi } from '@/hooks/use-api'
import { ConversationView, type ConversationMeta } from './conversation-view'
import { relativeTime } from '@/lib/money'

function roleLabelKey(role: string): string {
  switch (role) {
    case 'PATIENT': return 'chat.rolePatient'
    case 'DOCTOR': return 'chat.roleDoctor'
    case 'HOSPITAL': return 'chat.roleHospital'
    case 'HOTEL': return 'chat.roleHotel'
    case 'TRANSLATOR': return 'chat.roleTranslator'
    case 'ADMIN': return 'chat.roleAdmin'
    default: return 'chat.rolePatient'
  }
}

function statusDotClass(status: string): string {
  switch (status) {
    case 'CONFIRMED': return 'bg-success'
    case 'PENDING': return 'bg-warning'
    case 'COMPLETED': return 'bg-primary'
    case 'CANCELLED':
    case 'REFUNDED': return 'bg-error'
    default: return 'bg-muted-foreground'
  }
}

export function MessagesSection() {
  const { t, locale } = useT()
  const session = useApp((s) => s.session)
  const activeChatBookingId = useApp((s) => s.activeChatBookingId)
  const setActiveChatBookingId = useApp((s) => s.setActiveChatBookingId)
  const goDashboard = useApp((s) => s.goDashboard)

  // manualSelectedId is the conversation the user picked from the list.
  // activeChatBookingId (set by goMessages) takes priority so that clicking
  // "Open Chat" from a booking always opens the right conversation, even if
  // the user had previously selected a different one.
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null)
  const selectedId = activeChatBookingId ?? manualSelectedId
  const [search, setSearch] = useState('')

  const { data, loading, error, refetch } = useApi<{ conversations: ConversationMeta[] }>(`/api/chat/conversations`)

  // Poll conversations every 15s to refresh unread counts + last message previews
  useEffect(() => {
    const interval = setInterval(() => refetch(), 15000)
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [refetch])

  const conversations = data?.conversations || []

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.trim().toLowerCase()
    return conversations.filter((c) => {
      const name = (c.participant.name || '').toLowerCase()
      const service = (c.serviceTitle || '').toLowerCase()
      const preview = (c.lastMessage?.preview || '').toLowerCase()
      return name.includes(q) || service.includes(q) || preview.includes(q)
    })
  }, [conversations, search])

  const selected = conversations.find((c) => c.bookingId === selectedId) || null

  function handleSelect(id: string) {
    setManualSelectedId(id)
    // Consume any activeChatBookingId so manual selection takes over
    if (activeChatBookingId) setActiveChatBookingId(null)
  }

  function handleBack() {
    setManualSelectedId(null)
    if (activeChatBookingId) setActiveChatBookingId(null)
  }

  function handleViewBooking(bookingId: string) {
    // Navigate to the bookings section. Patient uses 'bookings', providers use 'appointments'.
    const section = session?.role === 'PATIENT' ? 'bookings' : 'appointments'
    goDashboard(section)
  }

  return (
    <div className="flex h-[calc(100vh-9.5rem)] min-h-[480px] overflow-hidden rounded-2xl border border-divider bg-surface shadow-sm">
      {/* Conversation list — sidebar on desktop, full view on mobile when no selection */}
      <aside
        className={cn(
          'flex w-full flex-col border-e border-divider bg-surface md:w-80 lg:w-96',
          selected && 'hidden md:flex',
        )}
      >
        {/* List header */}
        <div className="border-b border-divider p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="forum" size={20} className="text-primary" fill />
            <h1 className="text-base font-semibold text-foreground">{t('chat.title')}</h1>
          </div>
          <div className="relative">
            <Icon name="search" size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chat.searchConversations')}
              className="h-9 rounded-full bg-surface-secondary ps-9 text-sm"
            />
          </div>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Icon name="progress_activity" size={20} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-error">
              <Icon name="cloud_off" size={24} />
              <p>{t('chat.loadFailed')}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                <Icon name="refresh" size={14} />
                {t('chat.retry')}
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary">
                <Icon name="forum" size={26} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{t('chat.noConversations')}</p>
              <p className="text-xs text-muted-foreground">{t('chat.noConversationsDesc')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-divider">
              {filtered.map((c) => {
                const isSelected = c.bookingId === selectedId
                const initials = (c.participant.name || '?').charAt(0).toUpperCase()
                return (
                  <li key={c.bookingId}>
                    <button
                      onClick={() => handleSelect(c.bookingId)}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-3 text-start transition-colors',
                        isSelected ? 'bg-accent' : 'hover:bg-surface-secondary',
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="size-11">
                          {c.participant.avatarUrl ? <AvatarImage src={c.participant.avatarUrl} alt="" /> : null}
                          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials}</AvatarFallback>
                        </Avatar>
                        <span className={cn('absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-surface', statusDotClass(c.status))} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{c.participant.name || '—'}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {c.lastMessage ? relativeTime(c.lastMessage.createdAt, locale) : relativeTime(c.startDate, locale)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t(roleLabelKey(c.participant.role))}
                          </span>
                          {c.serviceTitle && (
                            <span className="truncate text-[10px] text-muted-foreground">{c.serviceTitle}</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {c.lastMessage
                              ? (c.lastMessage.preview || (c.lastMessage.hasAttachments ? '📎' : ''))
                              : <span className="italic">{t('chat.noMessages')}</span>}
                          </p>
                          {c.unreadCount > 0 && (
                            <span className="flex size-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                              {c.unreadCount > 9 ? '9+' : c.unreadCount}
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
      </aside>

      {/* Conversation area — hidden on mobile when no selection */}
      <section className={cn('flex min-w-0 flex-1 flex-col', !selected && 'hidden md:flex')}>
        {selected ? (
          <ConversationView
            key={selected.bookingId}
            conversation={selected}
            currentUserId={session?.id || ''}
            currentLanguage={session?.preferredLanguage || locale}
            onBack={handleBack}
            onViewBooking={handleViewBooking}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-surface-secondary">
              <Icon name="chat" size={40} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground">{t('chat.selectConversation')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('chat.selectConversationDesc')}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
