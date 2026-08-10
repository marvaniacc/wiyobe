'use client'

import { useState, useRef, useCallback } from 'react'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { apiPost } from '@/hooks/use-api'

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_ATTACHMENTS = 6
const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip',
])

interface PendingAttachment {
  id: string // local temp id
  fileName: string
  fileType: string
  fileSize: number
  dataUrl: string
  previewUrl?: string // object URL for local image preview
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImage(type: string) {
  return type.startsWith('image/')
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

/**
 * Read a File into a base64 data URL.
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function MessageComposer({ bookingId, onSent }: {
  bookingId: string
  onSent: () => void
}) {
  const { t } = useT()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    if (pending.length + arr.length > MAX_ATTACHMENTS) {
      toast.error(t('chat.maxFiles'))
      return
    }
    const newPending: PendingAttachment[] = []
    for (const file of arr) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name}: ${t('chat.fileTooLarge')}`)
        continue
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        toast.error(`${file.name}: ${t('chat.fileTypeUnsupported')}`)
        continue
      }
      try {
        const dataUrl = await readFileAsDataUrl(file)
        newPending.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          dataUrl,
          previewUrl: isImage(file.type) ? URL.createObjectURL(file) : undefined,
        })
      } catch {
        toast.error(`${file.name}: ${t('chat.uploadFailed')}`)
      }
    }
    if (newPending.length > 0) {
      setPending((prev) => [...prev, ...newPending].slice(0, MAX_ATTACHMENTS))
    }
  }, [pending.length, t])

  function removePending(id: string) {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed && pending.length === 0) return
    if (sending) return
    setSending(true)
    try {
      await apiPost('/api/chat', {
        bookingId,
        message: trimmed || undefined,
        attachments: pending.length > 0
          ? pending.map((p) => ({ fileName: p.fileName, fileType: p.fileType, fileSize: p.fileSize, dataUrl: p.dataUrl }))
          : undefined,
      })
      // Clean up preview object URLs
      for (const p of pending) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      }
      setText('')
      setPending([])
      onSent()
    } catch (e: any) {
      toast.error(e.message || t('chat.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  const canSend = (text.trim().length > 0 || pending.length > 0) && !sending

  return (
    <div
      className="relative border-t border-divider bg-surface p-3"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
          <div className="flex flex-col items-center gap-1 text-primary">
            <Icon name="cloud_upload" size={32} />
            <span className="text-sm font-medium">{t('chat.dragDrop')}</span>
          </div>
        </div>
      )}

      {/* Pending attachments preview */}
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="group relative flex items-center gap-2.5 rounded-lg border border-divider bg-surface-secondary p-2 pr-7"
            >
              {p.previewUrl ? (
                <img src={p.previewUrl} alt={p.fileName} className="size-10 rounded object-cover" />
              ) : (
                <div className="flex size-10 items-center justify-center rounded bg-primary/10 text-primary">
                  <Icon name={fileIcon(p.fileType)} size={18} />
                </div>
              )}
              <div className="min-w-0 max-w-32">
                <p className="truncate text-xs font-medium text-foreground">{p.fileName}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(p.fileSize)}</p>
              </div>
              <button
                onClick={() => removePending(p.id)}
                className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-full bg-surface text-muted-foreground transition-colors hover:bg-error hover:text-error-foreground"
                title={t('chat.removeAttachment')}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer row */}
      <div className="flex items-end gap-2">
        {/* Attach button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={Array.from(ALLOWED_TYPES).join(',')}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = '' // reset so same file can be re-selected
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || pending.length >= MAX_ATTACHMENTS}
          title={t('chat.attachFile')}
        >
          <Icon name="attach_file" size={20} />
        </Button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.typeMessage')}
          rows={1}
          maxLength={2000}
          className={cn(
            'flex-1 resize-none rounded-2xl border border-divider bg-surface-secondary px-4 py-2.5 text-sm text-foreground outline-none transition-colors',
            'placeholder:text-muted-foreground focus:border-primary focus:bg-surface',
            'max-h-32 min-h-[42px]',
          )}
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 128)}px`
          }}
          disabled={sending}
        />

        {/* Send button */}
        <Button
          type="button"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={handleSend}
          disabled={!canSend}
          title={t('chat.send')}
        >
          {sending ? (
            <Icon name="progress_activity" size={18} className="animate-spin" />
          ) : (
            <Icon name="send" size={18} />
          )}
        </Button>
      </div>
    </div>
  )
}
