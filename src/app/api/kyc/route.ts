import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'kyc')
const MAX_FILE_SIZE_IMAGE = 5 * 1024 * 1024 // 5 MB for images/PDFs
const MAX_FILE_SIZE_VIDEO = 15 * 1024 * 1024 // 15 MB for videos

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'application/pdf',
  'video/webm', 'video/mp4', 'video/quicktime', 'video/x-msvideo',
])

function getExtension(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName)
  if (fromName) return fromName
  const map: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
    'image/webp': '.webp', 'image/bmp': '.bmp', 'application/pdf': '.pdf',
    'video/webm': '.webm', 'video/mp4': '.mp4', 'video/quicktime': '.mov',
  }
  return map[mimeType] || '.bin'
}

/**
 * GET /api/kyc
 *
 * Provider only. Returns the KYC requirements for the caller's provider type,
 * merged with their existing KycDocument submissions so the UI knows which
 * requirements are fulfilled and what their status is.
 *
 * Response shape:
 *   { requirements: [{ ...requirement, document: KycDocument | null }], kycStatus: string }
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
    if (!providerRoles.includes(session.role)) return error(403, 'Providers only')

    const providerType = session.role as ProviderType

    // Fetch requirements for this provider type
    const requirements = await db.kycRequirement.findMany({
      where: { providerType },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })

    // Fetch the provider's existing KYC documents (exclude soft-deleted if applicable)
    const documents = await db.kycDocument.findMany({
      where: { userId: session.id },
      orderBy: { uploadedAt: 'desc' },
    })

    // Merge: for each requirement, find the latest document submitted for it
    const merged = requirements.map((req) => {
      const doc = documents.find((d) => d.requirementId === req.id)
      return {
        ...req,
        document: doc || null,
      }
    })

    // Also include any documents not tied to a requirement (legacy uploads)
    const orphanDocs = documents.filter((d) => !d.requirementId)

    // Fetch user's kycStatus
    const userRow = await db.user.findUnique({
      where: { id: session.id },
      select: { kycStatus: true },
    })

    // Collect video-specific rejection reasons from rejected documents
    const VIDEO_REJECTION_CODES = new Set([
      'VIDEO_MISSING', 'VIDEO_TOO_SHORT', 'VIDEO_TOO_LONG',
      'VIDEO_FACE_NOT_VISIBLE', 'VIDEO_ID_NOT_VISIBLE',
      'VIDEO_POOR_QUALITY', 'VIDEO_FORMAT_UNSUPPORTED', 'VIDEO_FACE_NOT_MATCHING_ID',
    ])
    const allCodes: string[] = []
    for (const doc of documents) {
      if (doc.reviewStatus === 'REJECTED' && doc.rejectionReason) {
        try {
          const reason = typeof doc.rejectionReason === 'string'
            ? JSON.parse(doc.rejectionReason)
            : doc.rejectionReason
          if (Array.isArray(reason)) {
            allCodes.push(...reason.filter((c: any) => typeof c === 'string'))
          }
        } catch {}
      }
    }
    const rejectionReasons = Array.from(new Set(allCodes))
    const videoRejected = rejectionReasons.some((c) => VIDEO_REJECTION_CODES.has(c))

    return json({
      requirements: merged,
      orphanDocuments: orphanDocs,
      kycStatus: userRow?.kycStatus || 'PENDING',
      videoRejected,
      rejectionReasons,
    })
  } catch (e) { return handleError(e) }
}

/**
 * POST /api/kyc
 *
 * Provider only. Accepts multipart/form-data with `requirementId` and `file`.
 * Saves the file to public/uploads/kyc/ with a unique name, creates a
 * KycDocument record with reviewStatus PENDING, and updates the user's
 * kycStatus to IN_REVIEW.
 *
 * If the provider already has a document for this requirement, the old one
 * is replaced (deleted) — only one document per requirement is allowed.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
    if (!providerRoles.includes(session.role)) return error(403, 'Providers only')

    const formData = await req.formData()
    const requirementId = formData.get('requirementId') as string
    const file = formData.get('file')

    if (!requirementId) return error(400, 'requirementId is required')
    if (!file || !(file instanceof File)) return error(400, 'No file provided')

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return error(400, `File type "${file.type}" is not allowed. Allowed: images, PDF, and video (WebM, MP4, MOV).`)
    }

    // Validate file size (videos get 15MB, images/PDFs get 5MB)
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? MAX_FILE_SIZE_VIDEO : MAX_FILE_SIZE_IMAGE
    if (file.size > maxSize) {
      return error(400, `File too large (max ${Math.round(maxSize / (1024 * 1024))}MB for ${isVideo ? 'video' : 'images/PDF'})`)
    }

    // Verify the requirement exists and belongs to the caller's provider type
    const requirement = await db.kycRequirement.findUnique({
      where: { id: requirementId },
    })
    if (!requirement || requirement.providerType !== session.role) {
      return error(404, 'Requirement not found for your provider type')
    }

    // If KYC is already APPROVED, don't allow re-upload (unless a specific
    // document was REJECTED — admin can reject individual docs in Phase 16.3)
    const userKycStatus = (session as any).kycStatus || 'PENDING'
    if (userKycStatus === 'APPROVED') {
      return error(409, 'Your KYC is already approved. Contact support to update documents.')
    }

    // Ensure the upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate unique filename
    const ext = getExtension(file.name, file.type)
    const uniqueName = `${crypto.randomUUID()}${ext}`
    const fullPath = path.join(UPLOAD_DIR, uniqueName)

    // Write file to disk
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    try {
      await writeFile(fullPath, buffer)
    } catch (writeErr: any) {
      console.error('[kyc upload] Failed to write file:', writeErr)
      return error(500, 'Failed to save file to disk.')
    }

    const filePath = `/uploads/kyc/${uniqueName}`

    // If there's an existing document for this requirement, delete it
    // (only one document per requirement — re-upload replaces the old one)
    const existingDoc = await db.kycDocument.findFirst({
      where: { userId: session.id, requirementId },
    })
    if (existingDoc) {
      await db.kycDocument.delete({ where: { id: existingDoc.id } })
    }

    // Create the new KycDocument record
    const doc = await db.kycDocument.create({
      data: {
        userId: session.id,
        requirementId,
        documentName: requirement.documentName,
        docType: requirement.documentName.toLowerCase().replace(/\s+/g, '_'),
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        dataUrl: filePath, // store the file path (not base64 for KYC)
        status: 'PENDING',
        reviewStatus: 'PENDING',
        uploadedAt: new Date(),
      },
    })

    // Update the user's kycStatus to PENDING (if not already APPROVED)
    if (userKycStatus !== 'APPROVED') {
      await db.user.update({
        where: { id: session.id },
        data: { kycStatus: 'PENDING' },
      })
    }

    // Notify admins
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    })
    for (const admin of admins) {
      await db.notification.create({
        data: {
          userId: admin.id,
          type: 'system',
          category: 'KYC',
          title: 'New KYC document submitted',
          body: `${session.name || 'A provider'} submitted "${requirement.documentName}" for verification.`,
          link: 'kyc',
          isRead: false,
          read: false,
        },
      })
    }

    return json({ document: doc }, 201)
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/kyc?id=xxx
 *
 * Provider only. Deletes a PENDING or REJECTED KYC document. APPROVED
 * documents cannot be deleted (they're part of the verified record).
 */
export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
    if (!providerRoles.includes(session.role)) return error(403, 'Providers only')

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')

    const doc = await db.kycDocument.findUnique({ where: { id } })
    if (!doc || doc.userId !== session.id) return error(404, 'Document not found')

    // Can only delete PENDING or REJECTED documents
    if (doc.reviewStatus === 'APPROVED' || doc.status === 'APPROVED') {
      return error(409, 'Cannot delete an approved document')
    }

    await db.kycDocument.delete({ where: { id } })

    // Try to remove the file from disk (gracefully handle ENOENT)
    if (doc.dataUrl?.startsWith('/uploads/')) {
      const fullPath = path.join(process.cwd(), 'public', doc.dataUrl)
      try {
        const { unlink } = await import('fs/promises')
        await unlink(fullPath)
      } catch (fsErr: any) {
        if (fsErr.code !== 'ENOENT') console.error('[kyc delete] Failed to delete file:', fsErr)
      }
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
