'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useApi } from '@/hooks/use-api'
import { MessageBubble, type ChatMessageData } from './message-bubble'
import { MessageComposer } from './message-composer'
import { formatDateTime } from '@/lib/money'

export interface ConversationMeta {
  bookingId: string
  status: string
  startDate: string
  visitType: string
  providerType: string
  serviceTitle: string | null
  amount: string
  currency: string
  participant: {
    id: string | null
    name: string | null
    avatarUrl: string | null
    role: string
  }
  lastMessage: { id: string; preview: string; senderId: string; createdAt: string; hasAttachments: boolean } | null
  unreadCount: number
}

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

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'CONFIRMED': return 'border-success/20 bg-success/5 text-success'
    case 'PENDING': return 'border-warning/20 bg-warning/5 text-warning'
    case 'COMPLETED': return 'border-primary/20 bg-primary/5 text-primary'
    case 'CANCELLED':
    case 'REFUNDED': return 'border-error/20 bg-error/5 text-error'
    default: return 'border-divider bg-surface-secondary text-muted-foreground'
  }
}

function statusLabelKey(status: string): string {
  switch (status) {
    case 'PENDING': return 'common.pending'
    case 'CONFIRMED': return 'common.confirmed'
    case 'COMPLETED': return 'common.completed'
    case 'CANCELLED': return 'common.cancelled'
    case 'REFUNDED': return 'common.refunded'
    default: return 'common.pending'
  }
}

export function ConversationView({
  conversation,
  currentUserId,
  currentLanguage,
  onBack,
  onViewBooking,
}: {
  conversation: ConversationMeta
  currentUserId: string
  currentLanguage: string
  onBack: () => void
  onViewBooking: (bookingId: string) => void
}) {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ messages: ChatMessageData[] }>(
    `/api/chat?bookingId=${conversation.bookingId}`,
    { deps: [conversation.bookingId] },
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => refetch(), 5000)
    return () => clearInterval(interval)
  }, [refetch])

  // Auto-scroll to bottom when new messages arrive (only if user is already near bottom)
  useEffect(() => {
    if (scrollRef.current && atBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [data?.messages, atBottom])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(nearBottom)
  }, [])

  const messages = data?.messages || []
  const participant = conversation.participant
  const initials = (participant.name || '?').charAt(0).toUpperCase()

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-divider bg-surface px-3 py-2.5 md:px-4">
        <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onBack} title={t('chat.backToList')}>
          <Icon name="arrow_back" size={20} className="rtl:rotate-180" />
        </Button>

        <Avatar className="size-10 shrink-0">
          {participant.avatarUrl ? <AvatarImage src={participant.avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{participant.name || '—'}</h2>
            <span className="shrink-0 rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t(roleLabelKey(participant.role))}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{conversation.serviceTitle || t('booking.detailTitle')}</span>
            <span>·</span>
            <span className="shrink-0">{formatDateTime(conversation.startDate, locale)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={cn('hidden rounded-full border sm:inline-flex', statusBadgeClass(conversation.status))}>
            {t(statusLabelKey(conversation.status))}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onViewBooking(conversation.bookingId)}
          >
            <Icon name="receipt_long" size={14} />
            <span className="hidden sm:inline">{t('chat.viewBooking')}</span>
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-surface-secondary/30 px-3 py-4 md:px-6"
      >
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Icon name="cloud_off" size={32} className="text-error" />
            <p className="text-sm text-error">{t('chat.loadFailed')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <Icon name="refresh" size={14} />
              {t('chat.retry')}
            </Button>
          </div>
        ) : !data && loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Icon name="progress_activity" size={24} className="animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-surface-secondary">
              <Icon name="chat_bubble_outline" size={32} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">{t('chat.noMessages')}</p>
            <p className="max-w-xs text-xs text-muted-foreground">{t('chat.startConversation')}</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMe={msg.senderId === currentUserId}
                currentLanguage={currentLanguage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <MessageComposer bookingId={conversation.bookingId} onSent={refetch} />
    </div>
  )
}
