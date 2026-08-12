'use client'
import { useState, useRef, useCallback } from 'react'
import { Icon } from '@/components/shared/icon'
import { useT } from '@/hooks/use-t'
import { apiDelete } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { relativeTime } from '@/lib/money'

/* -------------------------------------------------------------------------
 * Provider KYC Section — requirement-based document upload
 *
 * Lists the KYC requirements for the provider's type. For each requirement,
 * shows the upload status (not uploaded / pending / approved / rejected)
 * and allows uploading/re-uploading a file.
 * ----------------------------------------------------------------------- */

type KycRequirement = {
  id: string
  providerType: string
  documentName: string
  description: string | null
  isRequired: boolean
  order: number
}

type KycDocument = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  reviewStatus: string // PENDING | APPROVED | REJECTED
  status: string // legacy: NOT_SUBMITTED | PENDING | APPROVED | REJECTED
  rejectionReason: string | null
  adminNote: string | null
  uploadedAt: string
}

type RequirementWithDoc = KycRequirement & {
  document: KycDocument | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function getDocStatus(doc: KycDocument | null): 'not_uploaded' | 'pending' | 'approved' | 'rejected' {
  if (!doc) return 'not_uploaded'
  // Use reviewStatus (new) with fallback to status (legacy)
  const st = doc.reviewStatus || doc.status || 'PENDING'
  if (st === 'APPROVED') return 'approved'
  if (st === 'REJECTED') return 'rejected'
  return 'pending'
}

const STATUS_CONFIG: Record<string, { icon: string; label: string; cls: string; cardCls: string }> = {
  not_uploaded: {
    icon: 'upload_file',
    label: 'Not Uploaded',
    cls: 'bg-muted text-muted-foreground',
    cardCls: 'border-divider',
  },
  pending: {
    icon: 'hourglass_top',
    label: 'Pending Review',
    cls: 'bg-warning/10 text-warning',
    cardCls: 'border-warning/20',
  },
  approved: {
    icon: 'check_circle',
    label: 'Approved',
    cls: 'bg-success/10 text-success',
    cardCls: 'border-success/20',
  },
  rejected: {
    icon: 'cancel',
    label: 'Rejected',
    cls: 'bg-error/10 text-error',
    cardCls: 'border-error/20',
  },
}

export function KycVerificationSection() {
  const { t, locale } = useT()
  const [requirements, setRequirements] = useState<RequirementWithDoc[]>([])
  const [kycStatus, setKycStatus] = useState<string>('PENDING')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  const fetchKyc = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/kyc')
      const data = await res.json()
      setRequirements(data.requirements || [])
      setKycStatus(data.kycStatus || 'PENDING')
    } catch (e: any) {
      setError(e.message || 'Failed to load KYC requirements')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useState(() => { fetchKyc() })

  async function handleUpload(requirementId: string, file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('provider.fileTooLarge', 'File too large (max 5MB)'))
      return
    }
    setUploadingFor(requirementId)
    try {
      const formData = new FormData()
      formData.append('requirementId', requirementId)
      formData.append('file', file)
      const res = await fetch('/api/kyc', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      toast.success(t('provider.documentUploaded', 'Document uploaded successfully'))
      fetchKyc() // refresh to show new status
    } catch (e: any) {
      toast.error(e.message || t('provider.uploadError', 'Upload failed'))
    } finally {
      setUploadingFor(null)
    }
  }

  async function handleDelete(docId: string) {
    try {
      await apiDelete(`/api/kyc?id=${docId}`)
      toast.success(t('provider.documentDeleted', 'Document deleted'))
      fetchKyc()
    } catch (e: any) {
      toast.error(e.message || t('common.error'))
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <Icon name="badge" size={26} className="text-primary" fill />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t('provider.kycVerification', 'KYC Verification')}</h1>
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[16px]" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <Icon name="badge" size={26} className="text-primary" fill />
          <h1 className="text-2xl font-semibold text-foreground">{t('provider.kycVerification', 'KYC Verification')}</h1>
        </div>
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{error}</CardContent></Card>
      </div>
    )
  }

  // Overall status banner
  const allApproved = requirements.length > 0 && requirements.every((r) => getDocStatus(r.document) === 'approved')
  const hasPending = requirements.some((r) => getDocStatus(r.document) === 'pending')
  const hasRejected = requirements.some((r) => getDocStatus(r.document) === 'rejected')
  const allUploaded = requirements.every((r) => r.document !== null)

  const bannerConfig = allApproved
    ? { icon: 'verified_user', cls: 'border-success/20 bg-success/[0.02]', iconCls: 'bg-success/10 text-success', title: t('kyc.verified', 'Verified'), desc: t('kyc.verifiedDesc', 'Your account is verified. All features are unlocked.') }
    : hasPending
      ? { icon: 'hourglass_top', cls: 'border-warning/20 bg-warning/[0.02]', iconCls: 'bg-warning/10 text-warning', title: t('provider.documentPending', 'Documents Under Review'), desc: t('provider.kycReviewDesc', 'Your documents are being reviewed. This usually takes 24-48 hours.') }
      : hasRejected
        ? { icon: 'cancel', cls: 'border-error/20 bg-error/[0.02]', iconCls: 'bg-error/10 text-error', title: t('provider.documentRejected', 'Documents Rejected'), desc: t('provider.kycRejectedDesc', 'Some documents were rejected. Please re-upload the rejected files.') }
        : { icon: 'info', cls: 'border-info/20 bg-info/[0.02]', iconCls: 'bg-info/10 text-info', title: t('provider.kycVerification', 'KYC Verification Required'), desc: t('provider.kycRequiredDesc', 'Upload the required documents below to verify your account and unlock all features.') }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Icon name="badge" size={26} className="text-primary" fill />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('provider.kycVerification', 'KYC Verification')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('provider.kycDesc', 'Submit the required documents to verify your account.')}</p>
        </div>
      </div>

      {/* Status banner */}
      <Card className={cn('gap-0', bannerConfig.cls)}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-[14px]', bannerConfig.iconCls)}>
            <Icon name={bannerConfig.icon} size={24} fill />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{bannerConfig.title}</p>
            <p className="text-xs text-muted-foreground">{bannerConfig.desc}</p>
          </div>
        </CardContent>
      </Card>

      {/* Progress indicator */}
      {requirements.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="task_alt" size={16} />
          <span>{requirements.filter((r) => getDocStatus(r.document) === 'approved').length} / {requirements.length} {t('provider.documentsApproved', 'documents approved')}</span>
        </div>
      )}

      {/* Requirements list */}
      {requirements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Icon name="folder_off" size={32} className="text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t('kyc.noRequirements', 'No requirements defined')}</p>
            <p className="text-xs text-muted-foreground">{t('kyc.noRequirementsDesc', 'Please contact support.')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requirements.map((req) => {
            const status = getDocStatus(req.document)
            const cfg = STATUS_CONFIG[status]
            const canUpload = status === 'not_uploaded' || status === 'rejected'
            const canDelete = status === 'pending' || status === 'rejected'
            return (
              <Card key={req.id} className={cn('gap-0 transition-all', cfg.cardCls)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Order number */}
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-secondary text-sm font-bold text-muted-foreground">
                      {req.order}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{req.documentName}</p>
                          {req.description && <p className="mt-0.5 text-xs text-muted-foreground">{req.description}</p>}
                        </div>
                        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium', cfg.cls)}>
                          <Icon name={cfg.icon} size={12} fill />
                          {t(`provider.document${status.charAt(0).toUpperCase() + status.slice(1)}`, cfg.label)}
                        </span>
                      </div>

                      {/* Document details (if uploaded) */}
                      {req.document && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Icon name="description" size={12} />
                            {req.document.fileName}
                          </span>
                          <span>·</span>
                          <span>{formatFileSize(req.document.fileSize)}</span>
                          <span>·</span>
                          <span>{relativeTime(req.document.uploadedAt, locale)}</span>
                        </div>
                      )}

                      {/* Rejection reason */}
                      {status === 'rejected' && (req.document?.rejectionReason || req.document?.adminNote) && (
                        <div className="mt-2 rounded-[8px] border-s-2 border-error bg-error/5 p-2">
                          <p className="text-xs font-medium text-error">{t('provider.rejectionReason', 'Rejection Reason')}</p>
                          <p className="text-xs text-muted-foreground">{req.document.rejectionReason || req.document.adminNote}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-2">
                        {canUpload && (
                          <UploadButton
                            requirementId={req.id}
                            onUpload={(file) => handleUpload(req.id, file)}
                            disabled={uploadingFor === req.id}
                            loading={uploadingFor === req.id}
                            label={status === 'rejected' ? t('provider.reupload', 'Re-upload') : t('provider.uploadDocument', 'Upload Document')}
                          />
                        )}
                        {canDelete && req.document && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(req.document!.id)}
                            className="text-error hover:bg-error/5"
                          >
                            <Icon name="delete" size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* --- Upload button with hidden file input --- */
function UploadButton({ requirementId, onUpload, disabled, loading, label }: {
  requirementId: string
  onUpload: (file: File) => void
  disabled?: boolean
  loading?: boolean
  label: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        className="gap-1.5"
      >
        {loading ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="upload_file" size={14} />}
        {label}
      </Button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,.pdf"
      />
    </>
  )
}
