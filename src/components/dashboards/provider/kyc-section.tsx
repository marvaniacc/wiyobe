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
  // Liveness video state
  const [kycVideoPath, setKycVideoPath] = useState<string | null>(null)
  const [videoRejected, setVideoRejected] = useState(false)
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([])
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [deletingVideo, setDeletingVideo] = useState(false)
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
      setKycVideoPath(data.kycVideoPath ?? null)
      setVideoRejected(Boolean(data.videoRejected))
      setRejectionReasons(Array.isArray(data.rejectionReasons) ? data.rejectionReasons : [])
    } catch (e: any) {
      setError(e.message || 'Failed to load KYC requirements')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => { fetchKyc() }, [fetchKyc])

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

  // Upload the liveness video to /api/kyc/video with XHR for progress
  const handleVideoUpload = useCallback(async (file: File) => {
    if (!file.type || !file.type.startsWith('video/')) {
      toast.error('Please select a video file.')
      return
    }
    if (file.size > MAX_VIDEO_SIZE) {
      toast.error(`Video too large (max ${Math.round(MAX_VIDEO_SIZE / (1024 * 1024))}MB)`)
      return
    }
    setUploadingVideo(true)
    setVideoProgress(0)
    try {
      const formData = new FormData()
      formData.append('video', file)
      const xhr = new XMLHttpRequest()
      const result = await new Promise<{ ok: boolean; status: number; body: any }>((resolve, reject) => {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setVideoProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText)
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body })
          } catch {
            reject(new Error('Invalid server response'))
          }
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.open('POST', '/api/kyc/video')
        xhr.send(formData)
      })
      if (!result.ok) throw new Error(result.body?.error || 'Upload failed')
      setKycVideoPath(result.body.kycVideoPath ?? null)
      setKycStatus(result.body.kycStatus || 'IN_REVIEW')
      toast.success('Liveness video uploaded successfully')
    } catch (e: any) {
      console.error('Video upload error:', e)
      toast.error(e.message || 'Failed to upload video')
    } finally {
      setUploadingVideo(false)
      setVideoProgress(0)
    }
  }, [])

  async function handleVideoDelete() {
    setDeletingVideo(true)
    try {
      await apiDelete('/api/kyc/video')
      setKycVideoPath(null)
      toast.success('Video removed')
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove video')
    } finally {
      setDeletingVideo(false)
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

      {/* Liveness Video Section */}
      <LivenessVideoSection
        kycVideoPath={kycVideoPath}
        kycStatus={kycStatus}
        uploading={uploadingVideo}
        deleting={deletingVideo}
        progress={videoProgress}
        isRejected={videoRejected}
        rejectionReasons={rejectionReasons}
        onUpload={handleVideoUpload}
        onDelete={handleVideoDelete}
        disabled={kycStatus === 'APPROVED'}
      />

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

/* --- Liveness Video Section with Webcam Recording --- */
function LivenessVideoSection({
  kycVideoPath,
  kycStatus,
  uploading,
  deleting,
  progress,
  isRejected,
  rejectionReasons,
  onUpload,
  onDelete,
  disabled,
}: {
  kycVideoPath: string | null
  kycStatus: string
  uploading: boolean
  deleting: boolean
  progress: number
  isRejected: boolean
  rejectionReasons: string[]
  onUpload: (file: File) => void
  onDelete: () => void
  disabled?: boolean
}) {
  const { t } = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordedUrlRef = useRef<string | null>(null) // mirror of recordedUrl state for cleanup

  const [cameraActive, setCameraActive] = useState(false)
  const [recording, setRecording] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const uploaded = !!kycVideoPath
  const canDelete = !disabled && uploaded && (kycStatus === 'PENDING' || kycStatus === 'IN_REVIEW' || isRejected)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch {}
      }
      if (recordedUrlRef?.current) URL.revokeObjectURL(recordedUrlRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current)
    }
    setRecordedUrl(null)
    recordedUrlRef.current = null

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Camera not available. Please use a device with a camera.'
      setCameraError(msg)
      toast.error(msg)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      setCameraActive(true)
      // Bind stream to video element after it mounts
      requestAnimationFrame(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current
          videoRef.current.play().catch(() => {})
        }
      })
    } catch (e: any) {
      let msg = 'Camera not available. Please use a device with a camera.'
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'SecurityError') {
        msg = 'Camera access denied. Please allow camera access and try again.'
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError' || e.name === 'OverconstrainedError' || e.name === 'NotReadableError') {
        msg = 'No camera found. Please connect a camera and try again.'
      }
      console.error('Camera start error:', e)
      setCameraError(msg)
      toast.error(msg)
    }
  }

  function startRecording() {
    if (!streamRef.current) {
      toast.error('Camera not started. Please click "Start Camera" first.')
      return
    }

    // Dynamic MIME type selection for cross-browser compatibility
    const mimeType = getSupportedMimeType()
    if (!mimeType) {
      const msg = 'Your browser does not support video recording. Please use a modern browser like Chrome, Firefox, or Safari.'
      toast.error(msg)
      setCameraError(msg)
      return
    }

    chunksRef.current = []
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setRecordedBlob(blob)
        const url = URL.createObjectURL(blob)
        recordedUrlRef.current = url
        setRecordedUrl(url)
        setRecording(false)
        setCountdown(0)
      }

      recorder.onerror = (e: any) => {
        console.error('MediaRecorder error:', e)
        toast.error('Recording error. Please try again.')
        setRecording(false)
        setCountdown(0)
      }

      recorder.start()
      setRecording(true)
      setCountdown(5)

      // Countdown timer: 5, 4, 3, 2, 1, 0
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
            try {
              recorder.stop()
            } catch (err) {
              console.error('MediaRecorder stop error:', err)
              toast.error('Could not stop recording. Please try again.')
              setRecording(false)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (e: any) {
      console.error('MediaRecorder creation error:', e)
      toast.error('Could not start recording. Please try again or use a different browser.')
      setRecording(false)
      setCountdown(0)
    }
  }

  function handleRetake() {
    setRecordedBlob(null)
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    setRecordedUrl(null)
    recordedUrlRef.current = null
    // Re-bind stream if camera is still active
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }

  function handleUploadRecorded() {
    if (!recordedBlob) return
    const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([recordedBlob], `liveness.${ext}`, { type: recordedBlob.type })
    onUpload(file)
    // Clean up
    setRecordedBlob(null)
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    setRecordedUrl(null)
    recordedUrlRef.current = null
    stopCamera()
  }

  const videoRejectionLabels = rejectionReasons
    .filter((c) => c.startsWith('VIDEO_'))
    .map((c) => VIDEO_REJECTION_LABELS[c] || c)

  return (
    <Card className={cn(
      'gap-0 border-2',
      uploaded && !isRejected ? 'border-success/20' : isRejected ? 'border-error/30' : 'border-primary/20',
    )}>
      <CardContent className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-[10px]',
            uploaded && !isRejected ? 'bg-success/10 text-success' : isRejected ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary',
          )}>
            <Icon name={uploaded && !isRejected ? 'check_circle' : isRejected ? 'cancel' : 'videocam'} size={22} fill />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Liveness Verification Video</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Please record a 5-second video showing your face and your ID document. This is required to verify your identity and prevent fraud.
            </p>
          </div>
        </div>

        {/* Rejection warning */}
        {isRejected && (
          <div className="mt-3 rounded-[10px] border-s-2 border-error bg-error/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
              <Icon name="warning" size={14} />
              Your liveness video was rejected
            </p>
            {videoRejectionLabels.length > 0 ? (
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {videoRejectionLabels.map((label) => <li key={label}>{label}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Please re-record a clear video showing your face and ID document.</p>
            )}
          </div>
        )}

        {/* Already uploaded video preview */}
        {uploaded && kycVideoPath && !cameraActive && (
          <div className="mt-3 overflow-hidden rounded-[12px] border border-divider bg-black">
            <video src={kycVideoPath} controls playsInline className="h-auto max-h-[360px] w-full bg-black" />
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Icon name="progress_activity" size={12} className="animate-spin" />
                Uploading…
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(2, progress))}%` }} />
            </div>
          </div>
        )}

        {/* Camera error */}
        {cameraError && !cameraActive && (
          <div className="mt-3 rounded-[10px] border border-error/20 bg-error/5 p-3 text-xs text-error">
            <span className="flex items-center gap-1.5"><Icon name="error" size={14} />{cameraError}</span>
          </div>
        )}

        {/* Live camera preview */}
        {cameraActive && (
          <div className="relative mt-3 overflow-hidden rounded-[12px] border border-divider bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-auto max-h-[360px] w-full bg-black"
            />
            {/* Countdown overlay */}
            {recording && countdown > 0 && (
              <div className="absolute end-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
                <span className="size-2.5 animate-pulse rounded-full bg-white" />
                REC {countdown}
              </div>
            )}
            {/* Recording finished — playback */}
            {recordedBlob && !recording && recordedUrl && (
              <div className="mt-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Preview (recorded):</p>
                <video src={recordedUrl} controls autoPlay playsInline className="h-auto max-h-[360px] w-full rounded-[12px] border border-divider bg-black" />
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Recorded video is uploaded to secure cloud storage. Max 15MB.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canDelete && !cameraActive && (
              <Button size="sm" variant="ghost" onClick={onDelete} disabled={deleting || uploading} className="text-error hover:bg-error/5">
                {deleting ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="delete" size={14} />}
                Remove
              </Button>
            )}

            {/* Camera controls */}
            {!cameraActive && !uploading && (
              <Button size="sm" onClick={startCamera} disabled={disabled} className="gap-1.5">
                <Icon name="videocam" size={14} />
                {uploaded ? 'Record New Video' : 'Start Camera'}
              </Button>
            )}

            {cameraActive && !recording && !recordedBlob && (
              <>
                <Button size="sm" variant="outline" onClick={stopCamera}>
                  Cancel
                </Button>
                <Button size="sm" onClick={startRecording} className="gap-1.5">
                  <Icon name="fiber_manual_record" size={14} fill />
                  Record 5 Seconds
                </Button>
              </>
            )}

            {cameraActive && recordedBlob && !recording && (
              <>
                <Button size="sm" variant="outline" onClick={handleRetake}>
                  Retake
                </Button>
                <Button size="sm" onClick={handleUploadRecorded} disabled={uploading} className="gap-1.5">
                  {uploading ? <Icon name="progress_activity" size={14} className="animate-spin" /> : <Icon name="cloud_upload" size={14} />}
                  Upload Video
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
