'use client'
import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useT } from '@/hooks/use-t'
import { useApi, apiPost } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { formatDateTime, relativeTime } from '@/lib/money'
import { toast } from 'sonner'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'

/* =========================================================================
 * Shared Tickets Section — used by patient, provider, and admin dashboards
 * ======================================================================= */

const TICKET_STATUS_CONFIG: Record<string, { cls: string; label: string; icon: string }> = {
  OPEN: { cls: 'bg-warning/10 text-warning border-warning/20', label: 'Open', icon: 'mark_email_unread' },
  IN_PROGRESS: { cls: 'bg-info/10 text-info border-info/20', label: 'In progress', icon: 'pending' },
  RESOLVED: { cls: 'bg-success/10 text-success border-success/20', label: 'Resolved', icon: 'check_circle' },
  CLOSED: { cls: 'bg-muted text-muted-foreground border-divider', label: 'Closed', icon: 'lock' },
}

const TICKET_PRIORITY_CONFIG: Record<string, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-info/10 text-info',
  HIGH: 'bg-warning/10 text-warning',
  URGENT: 'bg-error/10 text-error',
}

const TICKET_CATEGORY_ICON: Record<string, string> = {
  booking: 'event', payment: 'payments', account: 'person', technical: 'build', other: 'help',
}

function initials(name?: string | null) {
  return (name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

export function TicketsSection({ isAdmin = false }: { isAdmin?: boolean }) {
  const { t, locale } = useT()
  const [tick, setTick] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const { data, loading, error, refetch } = useApi<{ tickets: any[] }>('/api/tickets', { deps: [tick] })

  function refresh() { setTick(x => x + 1); refetch() }

  const tickets = data?.tickets || []
  const selected = tickets.find(t => t.id === selectedId)

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">{t('tickets.title')}</h1>
        <Skeleton className="h-96 rounded-[16px]" />
      </div>
    )
  }
  if (error) return <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('tickets.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('tickets.desc')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Icon name="add" size={18} />
          {t('tickets.create')}
        </Button>
      </div>

      {tickets.length === 0 ? (
        <Card className="gap-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-16 items-center justify-center rounded-[20px] bg-surface-secondary text-muted-foreground">
              <Icon name="support_agent" size={32} />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{t('tickets.empty')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('tickets.emptyDesc')}</p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
              <Icon name="add" size={16} />
              {t('tickets.create')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Ticket list */}
          <div className="space-y-3 lg:col-span-2">
            {tickets.map((tk) => {
              const stCfg = TICKET_STATUS_CONFIG[tk.status] || TICKET_STATUS_CONFIG.OPEN
              const catIcon = TICKET_CATEGORY_ICON[tk.category] || 'help'
              return (
                <Card
                  key={tk.id}
                  className={cn('cursor-pointer gap-0 transition-all hover:shadow-md', selectedId === tk.id && 'ring-2 ring-primary')}
                  onClick={() => setSelectedId(tk.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-secondary text-muted-foreground">
                        <Icon name={catIcon} size={20} fill />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{tk.subject}</p>
                          <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', stCfg.cls)}>
                            {stCfg.label}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{tk.description}</p>
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', TICKET_PRIORITY_CONFIG[tk.priority] || '')}>{tk.priority}</span>
                          <span>·</span>
                          <span>{relativeTime(tk.updatedAt, locale)}</span>
                          {tk.messages?.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <Icon name="chat" size={10} />
                                {tk.messages.length}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Conversation panel */}
          {selected ? (
            <TicketConversation
              key={selected.id}
              ticket={selected}
              isAdmin={isAdmin}
              onMessageSent={refresh}
            />
          ) : (
            <Card className="hidden lg:col-span-3 lg:flex">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center text-sm text-muted-foreground">
                <Icon name="forum" size={32} className="mb-2 text-muted-foreground" />
                Select a ticket to view the conversation
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create ticket dialog */}
      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); refresh() }} />
    </div>
  )
}

function TicketConversation({ ticket, isAdmin, onMessageSent }: {
  ticket: any
  isAdmin: boolean
  onMessageSent: () => void
}) {
  const { t, locale } = useT()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [ticket.messages?.length])

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    try {
      await apiPost('/api/tickets/message', { ticketId: ticket.id, message: message.trim() })
      setMessage('')
      onMessageSent()
    } catch (e: any) { toast.error(e.message) } finally { setSending(false) }
  }

  async function handleStatusChange(status: string) {
    if (!isAdmin) return
    try {
      await apiPost('/api/admin/tickets/status', { ticketId: ticket.id, status })
      toast.success('Status updated')
      onMessageSent()
    } catch (e: any) { toast.error(e.message) }
  }

  const stCfg = TICKET_STATUS_CONFIG[ticket.status] || TICKET_STATUS_CONFIG.OPEN
  const catIcon = TICKET_CATEGORY_ICON[ticket.category] || 'help'

  return (
    <Card className="flex h-fit flex-col lg:col-span-3">
      <CardHeader className="border-b border-divider pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-secondary text-muted-foreground">
              <Icon name={catIcon} size={20} fill />
            </div>
            <div>
              <CardTitle className="text-sm">{ticket.subject}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ticket.user?.name || '—'} · {ticket.user?.role} · {formatDateTime(ticket.createdAt, locale)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium', stCfg.cls)}>
              <Icon name={stCfg.icon} size={12} fill />
              {stCfg.label}
            </span>
            {isAdmin && (
              <Select value={ticket.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-96 flex-1 space-y-3 overflow-y-auto p-4">
        {/* Initial ticket description as first message */}
        <div className="flex gap-3">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(ticket.user?.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{ticket.user?.name || 'User'}</span>
              <span className="text-[11px] text-muted-foreground">{formatDateTime(ticket.createdAt, locale)}</span>
            </div>
            <div className="mt-1 rounded-[14px] rounded-tl-sm bg-surface-secondary p-3 text-sm text-foreground">
              {ticket.description}
            </div>
          </div>
        </div>

        {/* Conversation messages */}
        {ticket.messages?.slice(1).map((msg: any) => (
          <div key={msg.id} className={cn('flex gap-3', msg.isFromAdmin && 'flex-row-reverse')}>
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className={cn('text-xs font-semibold', msg.isFromAdmin ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary')}>
                {msg.isFromAdmin ? 'AD' : initials(msg.sender?.name || ticket.user?.name)}
              </AvatarFallback>
            </Avatar>
            <div className={cn('min-w-0 max-w-[80%]', msg.isFromAdmin && 'text-end')}>
              <div className="flex items-center gap-2" style={msg.isFromAdmin ? { justifyContent: 'flex-end' } : {}}>
                <span className="text-sm font-medium text-foreground">{msg.isFromAdmin ? 'Admin' : msg.sender?.name || 'User'}</span>
                <span className="text-[11px] text-muted-foreground">{relativeTime(msg.createdAt, locale)}</span>
              </div>
              <div className={cn('mt-1 inline-block rounded-[14px] p-3 text-sm text-foreground',
                msg.isFromAdmin ? 'rounded-tr-sm bg-success/5' : 'rounded-tl-sm bg-surface-secondary')}>
                {msg.message}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply input */}
      <div className="border-t border-divider p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('tickets.replyPlaceholder')}
            rows={2}
            className="resize-none"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          />
          <Button size="sm" onClick={handleSend} disabled={sending || !message.trim()} className="gap-1.5 shrink-0">
            {sending ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="send" size={14} />}
            {t('tickets.send')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function CreateTicketDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const { t } = useT()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('booking')
  const [priority, setPriority] = useState('MEDIUM')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) { setSubject(''); setDescription(''); setCategory('booking'); setPriority('MEDIUM') }
  }, [open])

  async function handleSubmit() {
    if (subject.trim().length < 3 || description.trim().length < 10) return
    setSubmitting(true)
    try {
      await apiPost('/api/tickets', { subject: subject.trim(), description: description.trim(), category, priority })
      toast.success(t('tickets.created'))
      onCreated()
    } catch (e: any) { toast.error(e.message) } finally { setSubmitting(false) }
  }

  return (
    <Card className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" style={{ display: open ? 'flex' : 'none' }}>
      <Card className="w-full max-w-md gap-0">
        <CardHeader className="border-b border-divider pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="add_circle" size={18} className="text-primary" />
            {t('tickets.create')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('tickets.subject')}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of your issue" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('tickets.description')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your issue in detail..." rows={4} maxLength={2000} className="resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('tickets.category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="booking">{t('tickets.cat.booking')}</SelectItem>
                  <SelectItem value="payment">{t('tickets.cat.payment')}</SelectItem>
                  <SelectItem value="account">{t('tickets.cat.account')}</SelectItem>
                  <SelectItem value="technical">{t('tickets.cat.technical')}</SelectItem>
                  <SelectItem value="other">{t('tickets.cat.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('tickets.priority')}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">{t('tickets.pri.low')}</SelectItem>
                  <SelectItem value="MEDIUM">{t('tickets.pri.medium')}</SelectItem>
                  <SelectItem value="HIGH">{t('tickets.pri.high')}</SelectItem>
                  <SelectItem value="URGENT">{t('tickets.pri.urgent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <div className="flex justify-end gap-2 border-t border-divider p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={submitting || subject.trim().length < 3 || description.trim().length < 10} className="gap-1.5">
            {submitting ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="send" size={16} />}
            {t('tickets.create')}
          </Button>
        </div>
      </Card>
    </Card>
  )
}
