'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Icon } from '@/components/shared/icon'
import { useT } from '@/hooks/use-t'
import { apiDelete } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

/* -------------------------------------------------------------------------
 * MediaPicker — reusable media library dialog
 *
 * Shows a grid of uploaded files with an upload button (drag-and-drop or
 * file input). The user selects a file and the component calls onSelected
 * with the file's public path (e.g. "/uploads/uuid.png").
 * ----------------------------------------------------------------------- */

export type MediaAsset = {
  id: string
  fileName: string
  filePath: string
  mimeType: string
  fileSize: number
  createdAt: string
  uploader?: { id: string; name: string | null; email: string }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const IMAGE_MIME_PREFIXES = ['image/']

function isImage(mimeType: string): boolean {
  return IMAGE_MIME_PREFIXES.some((p) => mimeType.startsWith(p))
}

const FILE_ICON: Record<string, string> = {
  'application/pdf': 'picture_as_pdf',
  'application/msword': 'description',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'description',
  'application/vnd.ms-excel': 'table_chart',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'table_chart',
  'text/plain': 'text_snippet',
  'text/csv': 'table_chart',
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelected,
  filter = 'all',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSelected: (filePath: string) => void
  /** 'all' = show everything, 'image' = only images */
  filter?: 'all' | 'image'
}) {
  const { t } = useT()
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch assets whenever the dialog opens.
  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/media')
      const data = await res.json()
      const all: MediaAsset[] = data.assets || []
      setAssets(filter === 'image' ? all.filter((a) => isImage(a.mimeType)) : all)
    } catch {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  // When the dialog opens, reset the selection and fetch the latest assets.
  useEffect(() => {
    if (open) {
      setSelected(null)
      fetchAssets()
    }
  }, [open, fetchAssets])

  async function handleUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('media.tooLarge', 'File too large (max 5MB)'))
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/media', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      // Prepend the new asset
      const newAsset: MediaAsset = data.asset
      if (filter === 'image' && !isImage(newAsset.mimeType)) {
        toast.success(t('media.uploaded', 'File uploaded'))
      } else {
        setAssets((prev) => [newAsset, ...prev])
      }
      toast.success(t('media.uploaded', 'File uploaded'))
    } catch (e: any) {
      toast.error(e.message || t('media.uploadError', 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  async function handleDelete(asset: MediaAsset, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await apiDelete(`/api/media/${asset.id}`)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      if (selected === asset.filePath) setSelected(null)
      toast.success(t('media.deleted', 'File deleted'))
    } catch (err: any) {
      toast.error(err.message || t('common.error'))
    }
  }

  function handleConfirm() {
    if (selected) {
      onSelected(selected)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-divider p-5">
          <DialogTitle className="flex items-center gap-2">
            <Icon name="perm_media" size={20} className="text-primary" />
            {t('media.library', 'Media Library')}
          </DialogTitle>
          <DialogDescription>{t('media.selectDesc', 'Select a file or upload a new one.')}</DialogDescription>
        </DialogHeader>

        {/* Upload area */}
        <div className="shrink-0 border-b border-divider p-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed p-5 text-center transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-divider hover:border-primary/50 hover:bg-accent/30'
            )}
          >
            <Icon name={uploading ? 'progress_activity' : 'cloud_upload'} size={28} className={cn('text-muted-foreground', uploading && 'animate-spin text-primary')} />
            <p className="text-sm font-medium text-foreground">
              {uploading ? t('media.uploading', 'Uploading…') : t('media.upload', 'Upload')}
            </p>
            <p className="text-xs text-muted-foreground">{t('media.dragDrop', 'Drag and drop a file here, or click to browse (max 5MB)')}</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept={filter === 'image' ? 'image/*' : 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv'}
            />
          </div>
        </div>

        {/* Grid of assets — this section scrolls, footer stays fixed below */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-[12px]" />)}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Icon name="folder_off" size={32} className="text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{t('media.noFiles', 'No files yet')}</p>
              <p className="text-xs text-muted-foreground">{t('media.noFilesDesc', 'Upload a file to get started.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setSelected(asset.filePath)}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded-[12px] border-2 transition-all',
                    selected === asset.filePath ? 'border-primary ring-2 ring-primary/20' : 'border-divider hover:border-primary/40'
                  )}
                >
                  {/* Preview */}
                  <div className="relative flex aspect-square items-center justify-center bg-surface-secondary">
                    {isImage(asset.mimeType) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.filePath} alt={asset.fileName} className="size-full object-cover" />
                    ) : (
                      <Icon name={FILE_ICON[asset.mimeType] || 'draft'} size={32} className="text-muted-foreground" />
                    )}
                    {/* Selected check */}
                    {selected === asset.filePath && (
                      <div className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Icon name="check" size={14} fill />
                      </div>
                    )}
                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => handleDelete(asset, e)}
                      className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-surface/90 text-error opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-error hover:text-error-foreground"
                      title={t('media.delete', 'Delete')}
                    >
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                  {/* File info */}
                  <div className="p-2">
                    <p className="truncate text-[11px] font-medium text-foreground">{asset.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatFileSize(asset.fileSize)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — ALWAYS rendered, pinned to the bottom via shrink-0 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-divider bg-surface p-4">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {selected ? <span className="font-mono text-foreground">{selected}</span> : t('media.noSelection', 'No file selected')}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleConfirm} disabled={!selected} className="gap-1.5">
              <Icon name="check" size={16} />
              {t('media.insert', 'Insert')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
