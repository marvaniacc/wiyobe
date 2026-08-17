'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Icon } from '@/components/shared/icon'
import { useT } from '@/hooks/use-t'
import { apiDelete } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { relativeTime } from '@/lib/money'

const MAX_VIDEO_SIZE = 15 * 1024 * 1024 // 15 MB

// Human-readable labels for video-specific rejection codes
const VIDEO_REJECTION_LABELS: Record<string, string> = {
  VIDEO_TOO_SHORT: 'Video is too short (must be at least 3 seconds)',
  VIDEO_TOO_LONG: 'Video is too long (must be under 30 seconds)',
  VIDEO_FACE_NOT_VISIBLE: 'Your face is not clearly visible in the video',
  VIDEO_ID_NOT_VISIBLE: 'Your ID document is not clearly visible in the video',
  VIDEO_POOR_QUALITY: 'Video quality is too low to verify identity',
  VIDEO_FORMAT_UNSUPPORTED: 'Video format is not supported',
  VIDEO_FACE_NOT_MATCHING_ID: 'Face in the video does not match the ID document',
}

/**
 * Find the best supported MIME type for MediaRecorder across browsers.
 * Safari only supports video/mp4, Chrome/Firefox support video/webm.
 */
function getSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264',
    'video/mp4',
  ]
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch {
      // isTypeSupported can throw in some browsers
    }
  }
  return null
}

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
  type: string  // IMAGE | DOCUMENT | VIDEO
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
  rejectionReason: string | string[] | null  // Json? — array of codes or legacy string
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
  useEffect(() => { fetchKyc() }, [fetchKyc])

  async function handleUpload(requirementId: string, file: File) {
    // Look up the requirement to determine the max file size.
    // VIDEO allows up to MAX_VIDEO_SIZE (15 MB); IMAGE/DOCUMENT allow 5 MB.
    const req = requirements.find((r) => r.id === requirementId)
    const isVideo = req?.type === 'VIDEO'
    const maxSize = isVideo ? MAX_VIDEO_SIZE : 5 * 1024 * 1024
    if (file.size > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024))
      toast.error(t('provider.fileTooLarge', `File too large (max ${maxMb}MB)`))
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

  // Upload the liveness video to /api/kyc/video with XHR for progress
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
                          <p className="text-xs text-muted-foreground">
                            {(() => {
                              const reason = req.document?.rejectionReason
                              if (!reason) return req.document?.adminNote || ''
                              if (Array.isArray(reason)) {
                                return reason.map((code) => VIDEO_REJECTION_LABELS[code] || code).join(', ')
                              }
                              return String(reason)
                            })()}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-2">
                        {canUpload && req.type === 'VIDEO' && (
                          <VideoUploadButton
                            requirementId={req.id}
                            onUpload={(file) => handleUpload(req.id, file)}
                            disabled={uploadingFor === req.id}
                            loading={uploadingFor === req.id}
                          />
                        )}
                        {canUpload && req.type !== 'VIDEO' && (
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


/* --- Video Upload Button with Webcam Recording --- */

function VideoUploadButton({ onUpload, disabled, loading }: {
  requirementId: string
  onUpload: (file: File) => void
  disabled?: boolean
  loading?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordedUrlRef = useRef<string | null>(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [recording, setRecording] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    }
  }, [])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setRecording(false)
    setCountdown(0)
  }

  async function startCamera() {
    setCameraError(null)
    setRecordedBlob(null)
    if (recordedUrlRef.current) { URL.revokeObjectURL(recordedUrlRef.current); recordedUrlRef.current = null; setRecordedUrl(null) }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera not available.'); toast.error('Camera not available.'); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      setCameraActive(true)
      requestAnimationFrame(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current
          videoRef.current.play().catch(() => {})
        }
      })
    } catch (e: any) {
      const msg = e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'SecurityError'
        ? 'Camera access denied.' : 'Camera not available.'
      setCameraError(msg); toast.error(msg)
    }
  }

  function startRecording() {
    if (!streamRef.current) { toast.error('Camera not started.'); return }
    const mimeType = getSupportedMimeType()
    if (!mimeType) { toast.error('Your browser does not support video recording.'); return }
    chunksRef.current = []
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setRecordedBlob(blob)
        const url = URL.createObjectURL(blob)
        recordedUrlRef.current = url; setRecordedUrl(url)
        setRecording(false); setCountdown(0)
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
        if (videoRef.current) videoRef.current.srcObject = null
        setCameraActive(false)
      }
      recorder.onerror = () => { toast.error('Recording error.'); setRecording(false); setCountdown(0) }
      recorder.start()
      setRecording(true); setCountdown(5)
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
            try { recorder.stop() } catch { toast.error('Could not stop recording.'); setRecording(false) }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (e: any) {
      console.error('MediaRecorder error:', e)
      toast.error('Could not start recording.')
    }
  }

  function handleRetake() {
    setRecordedBlob(null)
    if (recordedUrlRef.current) { URL.revokeObjectURL(recordedUrlRef.current); recordedUrlRef.current = null; setRecordedUrl(null) }
    startCamera()
  }

  function handleUploadRecorded() {
    if (!recordedBlob) return
    const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([recordedBlob], `liveness.${ext}`, { type: recordedBlob.type })
    onUpload(file)
    setRecordedBlob(null)
    if (recordedUrlRef.current) { URL.revokeObjectURL(recordedUrlRef.current); recordedUrlRef.current = null; setRecordedUrl(null) }
    stopCamera()
  }

  return (
    <div className="space-y-2">
      {/* Camera error */}
      {cameraError && !cameraActive && (
        <div className="rounded-[8px] border border-error/20 bg-error/5 p-2 text-xs text-error">{cameraError}</div>
      )}

      {/* Live camera preview */}
      {cameraActive && !recordedBlob && (
        <div className="relative overflow-hidden rounded-[10px] border border-divider bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="h-auto max-h-[240px] w-full bg-black" />
          {recording && countdown > 0 && (
            <div className="absolute end-2 top-2 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
              <span className="size-2 animate-pulse rounded-full bg-white" /> REC {countdown}
            </div>
          )}
        </div>
      )}

      {/* Recorded preview */}
      {recordedBlob && recordedUrl && !cameraActive && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Preview (recorded):</p>
          <video src={recordedUrl} controls autoPlay playsInline className="h-auto max-h-[240px] w-full rounded-[10px] border border-divider bg-black" />
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {!cameraActive && !recordedBlob && !loading && (
          <Button size="sm" variant="outline" onClick={startCamera} disabled={disabled} className="gap-1.5">
            <Icon name="videocam" size={14} /> Start Camera
          </Button>
        )}
        {cameraActive && !recording && !recordedBlob && (
          <>
            <Button size="sm" variant="ghost" onClick={stopCamera}>Cancel</Button>
            <Button size="sm" onClick={startRecording} className="gap-1.5">
              <Icon name="fiber_manual_record" size={14} fill /> Record 5 Seconds
            </Button>
          </>
        )}
        {recordedBlob && !cameraActive && !recording && (
          <>
            <Button size="sm" variant="ghost" onClick={handleRetake}>Retake</Button>
            <Button size="sm" onClick={handleUploadRecorded} disabled={loading} className="gap-1.5">
              {loading ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="cloud_upload" size={14} />} Upload Video
            </Button>
          </>
        )}
        {loading && <span className="text-xs text-muted-foreground">Uploading…</span>}
      </div>
    </div>
  )
}
