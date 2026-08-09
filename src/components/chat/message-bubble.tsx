'use client'

import { useState } from 'react'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/icon'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatDateTime } from '@/lib/money'
import { apiPost } from '@/hooks/use-api'
import { toast } from 'sonner'

export interface ChatAttachmentMeta {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  createdAt: string
}

export interface ChatMessageData {
  id: string
  bookingId: string
  senderId: string
  message: string | null
  read: boolean
  createdAt: string
  sender: {
    id: string
    name: string | null
    avatarUrl: string | null
    role: string
  }
  attachments: ChatAttachmentMeta[]
}

const LANG_LABELS: Record<string, string> = {
  en: 'English', tr: 'Turkish', fa: 'Persian', ar: 'Arabic',
  fr: 'French', de: 'German', es: 'Spanish', ru: 'Russian',
  zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
  ur: 'Urdu', az: 'Azerbaijani', ku: 'Kurdish', ps: 'Pashto',
}

function isImage(type: string) {
  return type.startsWith('image/')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(type: string): string {
  if (isImage(type)) return 'image'
  if (type === 'application/pdf') return 'picture_as_pdf'
  if (type.includes('word') || type.includes('msword')) return 'description'
  if (type.includes('sheet') || type.includes('excel')) return 'table_chart'
  if (type === 'application/zip') return 'folder_zip'
  if (type.startsWith('text/')) return 'article'
  return 'draft'
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

export function MessageBubble({ msg, isMe, currentLanguage }: {
  msg: ChatMessageData
  isMe: boolean
  currentLanguage: string
}) {
  const { t, locale } = useT()
  const targetLang = currentLanguage || locale || 'en'
  const [translation, setTranslation] = useState<{ text: string | null; loading: boolean; error: boolean } | null>(null)

  async function handleTranslate() {
    if (translation?.loading) return
    if (translation?.text) return
    setTranslation({ text: null, loading: true, error: false })
    try {
      const res = await apiPost<{ translatedText: string; cached: boolean }>('/api/chat/translate', {
        messageId: msg.id,
        targetLanguage: targetLang,
      })
      setTranslation({ text: res.translatedText, loading: false, error: false })
    } catch (e: any) {
      setTranslation({ text: null, loading: false, error: true })
      toast.error(e.message || t('chat.translationFailed'))
    }
  }

  function handleRetry() {
    setTranslation(null)
    handleTranslate()
  }

  function handleHide() {
    setTranslation(null)
  }

  const hasAttachments = msg.attachments.length > 0
  const hasText = msg.message && msg.message.trim().length > 0

  return (
    <div className={cn('flex w-full gap-2.5', isMe && 'flex-row-reverse')}>
      <Avatar className="size-9 shrink-0 self-end">
        {msg.sender.avatarUrl ? <AvatarImage src={msg.sender.avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
          {(msg.sender.name || '?').charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex max-w-[78%] flex-col', isMe ? 'items-end' : 'items-start')}>
        {/* Sender name + role (only for the other party) */}
        {!isMe && (
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs">
            <span className="font-medium text-foreground">{msg.sender.name || 'Unknown'}</span>
            <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t(roleLabelKey(msg.sender.role))}
            </span>
          </div>
        )}

        {/* Bubble */}
        <div className={cn(
          'rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
          isMe
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-surface text-foreground border border-divider',
        )}>
          {/* Text */}
          {hasText && (
            <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.message}</p>
          )}

          {/* Attachments */}
          {hasAttachments && (
            <div className={cn('mt-1 flex flex-wrap gap-2', !hasText && 'mt-0')}>
              {msg.attachments.map((a) => (
                <AttachmentTile key={a.id} attachment={a} isMe={isMe} t={t} />
              ))}
            </div>
          )}
        </div>

        {/* Translation (only for messages from the other party) */}
        {!isMe && translation?.text && (
          <div className="mt-1.5 max-w-full rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground animate-fade-in">
            <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary">
              <Icon name="translate" size={11} />
              {LANG_LABELS[targetLang] || targetLang}
            </div>
            <p className="whitespace-pre-wrap break-words leading-relaxed">{translation.text}</p>
          </div>
        )}

        {/* Translation loading */}
        {!isMe && translation?.loading && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-xl border border-divider bg-surface-secondary px-3 py-2 text-xs text-muted-foreground animate-fade-in">
            <Icon name="progress_activity" size={12} className="animate-spin" />
            {t('chat.translating')}
          </div>
        )}

        {/* Translation error */}
        {!isMe && translation?.error && (
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-error/20 bg-error/5 px-3 py-2 text-xs text-error animate-fade-in">
            <Icon name="error" size={12} />
            {t('chat.translationFailed')}
            <button onClick={handleRetry} className="font-medium text-primary hover:underline">
              {t('chat.retry')}
            </button>
          </div>
        )}

        {/* Meta row: time + read receipt + translate action */}
        <div className={cn('mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground', isMe && 'flex-row-reverse')}>
          <span>{formatDateTime(msg.createdAt, locale)}</span>
          {isMe && msg.read && (
            <Icon name="done_all" size={12} className="text-primary" />
          )}
          {!isMe && !translation?.text && !translation?.loading && !translation?.error && hasText && (
            <button
              onClick={handleTranslate}
              className="flex items-center gap-0.5 font-medium text-primary transition-opacity hover:underline"
              title={`${t('chat.translate')} → ${LANG_LABELS[targetLang] || targetLang}`}
            >
              <Icon name="translate" size={11} />
              {t('chat.translate')}
            </button>
          )}
          {!isMe && translation?.text && (
            <button
              onClick={handleHide}
              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('chat.hide')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AttachmentTile({ attachment, isMe, t }: {
  attachment: ChatAttachmentMeta
  isMe: boolean
  t: (k: string, fb?: string) => string
}) {
  const url = `/api/chat/attachment?id=${attachment.id}`
  const downloadUrl = `/api/chat/attachment?id=${attachment.id}&download=1`

  if (isImage(attachment.fileType)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'group relative block overflow-hidden rounded-lg border',
          isMe ? 'border-primary-foreground/20' : 'border-divider',
        )}
        title={attachment.fileName}
      >
        <img
          src={url}
          alt={attachment.fileName}
          className="size-32 object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          {attachment.fileName}
        </span>
      </a>
    )
  }

  return (
    <a
      href={downloadUrl}
      className={cn(
        'flex w-60 items-center gap-3 rounded-lg border p-2.5 transition-colors',
        isMe
          ? 'border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground'
          : 'border-divider bg-surface-secondary hover:bg-surface text-foreground',
      )}
    >
      <div className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg',
        isMe ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary',
      )}>
        <Icon name={fileIcon(attachment.fileType)} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{attachment.fileName}</p>
        <p className="text-[10px] opacity-70">{formatBytes(attachment.fileSize)}</p>
      </div>
      <Icon name="download" size={16} className="shrink-0 opacity-70" />
    </a>
  )
}
