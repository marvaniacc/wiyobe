'use client'
import { useState, useEffect } from 'react'
import { Icon } from '@/components/shared/icon'
import { useT } from '@/hooks/use-t'
import { apiPatch } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

/* -------------------------------------------------------------------------
 * Medical Vault — Manage Access dialog
 *
 * Lets a patient grant or revoke a doctor's access to one of their medical
 * documents. The selectable doctor pool is restricted to doctors the
 * patient has a booking with (fetched from /api/medical-records/doctors).
 * ----------------------------------------------------------------------- */

export type DoctorOption = {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
  specialty: string | null
}

export type AccessGrant = {
  doctorId: string
  grantedAt: string
  doctor: {
    id: string
    name: string | null
    email: string
    doctor: { specialty: string | null } | null
  }
}

export type MedicalDocument = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  category: string
  notes: string | null
  createdAt: string
  accessGrants?: AccessGrant[]
}

export function ManageAccessDialog({
  open,
  onOpenChange,
  document: doc,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  document: MedicalDocument | null
  onUpdated: (doc: MedicalDocument) => void
}) {
  const { t } = useT()
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [loadingDoctors, setLoadingDoctors] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  // Load the patient's bookable doctors + the document's current grants
  // every time the dialog opens.
  useEffect(() => {
    if (!open || !doc) return
    setSearch('')
    setLoadingDoctors(true)
    ;(async () => {
      try {
        const res = await fetch('/api/medical-records/doctors')
        const data = await res.json()
        setDoctors(data.doctors || [])
      } catch {
        setDoctors([])
      } finally {
        setLoadingDoctors(false)
      }
    })()
    // Seed the selected set with the currently-granted doctor ids.
    const granted = new Set((doc.accessGrants || []).map((g) => g.doctorId))
    setSelected(granted)
  }, [open, doc])

  function toggleDoctor(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!doc) return
    setSaving(true)
    try {
      const res = await apiPatch<{ document: MedicalDocument }>(
        `/api/medical-records/${doc.id}`,
        { sharedWithDoctorIds: [...selected] }
      )
      toast.success(t('vault.accessUpdated', 'Access updated'))
      onUpdated(res.document)
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const filtered = doctors.filter((d) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (d.name || '').toLowerCase().includes(q) ||
      (d.specialty || '').toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q)
    )
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden p-0">
        <DialogHeader className="border-b border-divider p-5">
          <DialogTitle className="flex items-center gap-2">
            <Icon name="manage_accounts" size={20} className="text-primary" />
            {t('vault.manageAccess', 'Manage Access')}
          </DialogTitle>
          <DialogDescription className="truncate">
            {doc?.fileName} · {t('vault.selectDoctors', 'Select which doctors can view this document')}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-5 pt-4">
          <div className="relative">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('vault.searchDoctors', 'Search doctors…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Doctor list */}
        <div className="max-h-[40vh] flex-1 overflow-y-auto px-5 py-3">
          {loadingDoctors ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[12px] border border-divider p-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-10" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Icon name="person_search" size={32} className="text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{t('vault.noDoctors', 'No doctors yet')}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {t('vault.noDoctorsDesc', 'Book an appointment with a doctor first — only doctors you have booked with can be granted access.')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => {
                const on = selected.has(d.id)
                return (
                  <div
                    key={d.id}
                    className={cn(
                      'flex items-center gap-3 rounded-[12px] border p-3 transition-colors',
                      on ? 'border-primary/30 bg-primary/5' : 'border-divider hover:bg-accent/30'
                    )}
                  >
                    <Avatar className="size-10 shrink-0">
                      <AvatarImage src={d.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                        {(d.name || '?').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{d.name || d.email}</p>
                      {d.specialty && (
                        <p className="truncate text-xs text-muted-foreground">{d.specialty}</p>
                      )}
                    </div>
                    <Switch checked={on} onCheckedChange={() => toggleDoctor(d.id)} aria-label={t('vault.grantAccess', 'Grant access')} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-divider p-4">
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t('vault.accessCount', `${selected.size} doctor(s) with access`)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving || loadingDoctors} className="gap-1.5">
                {saving ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="save" size={16} />}
                {t('common.saveChanges', 'Save')}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
