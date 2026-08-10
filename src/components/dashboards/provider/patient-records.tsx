'use client'
import { useState } from 'react'
import { Icon } from '@/components/shared/icon'
import { useT } from '@/hooks/use-t'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'

/* -------------------------------------------------------------------------
 * Patient Records — provider-side view
 *
 * Doctors see the medical documents that patients have explicitly shared
 * with them (via /api/medical-records GET, which is role-aware). Each
 * record can be viewed/downloaded inline. Records are grouped by patient.
 * ----------------------------------------------------------------------- */

const CAT_CONFIG: Record<string, { icon: string; cls: string; key: string }> = {
  prescription: { icon: 'medication', cls: 'bg-primary/10 text-primary', key: 'documents.cat.prescription' },
  test_result: { icon: 'biotech', cls: 'bg-success/10 text-success', key: 'documents.cat.test_result' },
  insurance: { icon: 'health_and_safety', cls: 'bg-info/10 text-info', key: 'documents.cat.insurance' },
  passport: { icon: 'badge', cls: 'bg-warning/10 text-warning', key: 'documents.cat.passport' },
  other: { icon: 'description', cls: 'bg-muted text-muted-foreground', key: 'documents.cat.other' },
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

type SharedRecord = {
  id: string
  patientId: string
  fileName: string
  fileType: string
  fileSize: number
  category: string
  dataUrl: string
  notes: string | null
  createdAt: string
  grantedAt: string
  patient: { id: string; name: string | null; email: string; avatarUrl: string | null }
}

export function PatientRecordsSection() {
  const { t, locale } = useT()
  const { data, loading, error, refetch } = useApi<{ documents: SharedRecord[] }>('/api/medical-records')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<SharedRecord | null>(null)

  const records = data?.documents || []

  // Filter by patient name or file name.
  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.patient.name || '').toLowerCase().includes(q) ||
      r.fileName.toLowerCase().includes(q) ||
      r.patient.email.toLowerCase().includes(q)
    )
  })

  // Group by patient.
  const grouped: Record<string, { patient: SharedRecord['patient']; records: SharedRecord[] }> = {}
  for (const r of filtered) {
    if (!grouped[r.patientId]) grouped[r.patientId] = { patient: r.patient, records: [] }
    grouped[r.patientId].records.push(r)
  }
  const patientGroups = Object.values(grouped).sort((a, b) =>
    a.records[0].grantedAt < b.records[0].grantedAt ? 1 : -1
  )

  function downloadRecord(rec: SharedRecord) {
    const a = document.createElement('a')
    a.href = rec.dataUrl
    a.download = rec.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('provider.patientRecords', 'Patient Records')}
        description={t('provider.patientRecordsDesc', 'Medical documents your patients have shared with you')}
        icon="folder_shared"
      />

      {/* Search */}
      {records.length > 0 && (
        <div className="relative max-w-md">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('provider.searchRecords', 'Search by patient or file name…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : error ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{error}</CardContent></Card>
      ) : records.length === 0 ? (
        <EmptyState
          icon="folder_shared"
          title={t('provider.noSharedRecords', 'No shared records yet')}
          description={t('provider.noSharedRecordsDesc', 'When a patient shares a medical document with you, it will appear here. Let your patients know they can share records from their Documents section.')}
        />
      ) : patientGroups.length === 0 ? (
        <EmptyState
          icon="search_off"
          title={t('common.noResults', 'No results')}
          description={t('provider.searchNoMatch', 'No records match your search.')}
        />
      ) : (
        <div className="space-y-6">
          {patientGroups.map(({ patient, records: recs }) => (
            <div key={patient.id}>
              {/* Patient header */}
              <div className="mb-3 flex items-center gap-3">
                <Avatar className="size-9">
                  <AvatarImage src={patient.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                    {(patient.name || patient.email).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{patient.name || patient.email}</p>
                  <p className="text-xs text-muted-foreground">{recs.length} {recs.length === 1 ? t('provider.record', 'record') : t('provider.records', 'records')} · {t('provider.shared', 'Shared')} {relativeTime(recs[0].grantedAt, locale)}</p>
                </div>
              </div>

              {/* Records list */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recs.map((rec) => {
                  const cfg = CAT_CONFIG[rec.category] || CAT_CONFIG.other
                  return (
                    <Card key={rec.id} className="group gap-0 transition-all hover:shadow-md">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-[10px]', cfg.cls)}>
                            <Icon name={cfg.icon} size={20} fill />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{rec.fileName}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(rec.fileSize)} · {relativeTime(rec.createdAt, locale)}</p>
                            {rec.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{rec.notes}</p>}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setPreview(rec)} className="gap-1.5 flex-1">
                            <Icon name="visibility" size={14} />
                            {t('provider.view', 'View')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadRecord(rec)} title={t('documents.download', 'Download')} className="gap-1.5">
                            <Icon name="download" size={14} />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File preview dialog */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[16px] bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-divider p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{preview.fileName}</p>
                <p className="text-xs text-muted-foreground">{preview.patient.name || preview.patient.email} · {formatFileSize(preview.fileSize)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadRecord(preview)} className="gap-1.5">
                  <Icon name="download" size={14} />
                  <span className="hidden sm:inline">{t('documents.download', 'Download')}</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)} className="gap-1.5">
                  <Icon name="close" size={14} />
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
              {preview.fileType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.dataUrl} alt={preview.fileName} className="max-h-full max-w-full object-contain" />
              ) : preview.fileType === 'application/pdf' ? (
                <iframe src={preview.dataUrl} title={preview.fileName} className="h-[70vh] w-full rounded-[8px] border border-divider" />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Icon name="draft" size={48} className="text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">{t('provider.previewNotAvailable', 'Preview not available for this file type.')}</p>
                  <Button onClick={() => downloadRecord(preview)} className="gap-1.5">
                    <Icon name="download" size={16} />
                    {t('documents.download', 'Download')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* --- minimal local copies of shared layout helpers (this section is --- *
 * --- intentionally self-contained to avoid circular imports)         --- */
function PageHeader({ title, description, icon }: { title: string; description?: string; icon?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        {icon && <Icon name={icon} size={26} className="text-primary" fill />}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-divider bg-surface px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary text-muted-foreground">
        <Icon name={icon} size={28} fill />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
