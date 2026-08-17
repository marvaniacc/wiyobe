import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'kyc')
const MAX_VIDEO_SIZE = 15 * 1024 * 1024 // 15 MB

function getVideoExtension(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName)
  if (fromName) return fromName
  const map: Record<string, string> = {
    'video/webm': '.webm',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
  }
  return map[mimeType] || '.webm'
}

/**
 * GET /api/kyc/video
 * Returns the provider's liveness video status.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
    if (!providerRoles.includes(session.role)) return error(403, 'Providers only')

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { kycVideoPath: true, kycStatus: true },
    })

    return json({
      kycVideoPath: user?.kycVideoPath ?? null,
      kycStatus: user?.kycStatus || 'PENDING',
    })
  } catch (e) { return handleError(e) }
}

/**
 * POST /api/kyc/video
 * Accepts multipart/form-data with a `video` field. Saves the video
 * to public/uploads/kyc/ and updates user.kycVideoPath.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
    if (!providerRoles.includes(session.role)) return error(403, 'Providers only')

    const userKycStatus = (session as any).kycStatus || 'PENDING'
    if (userKycStatus === 'APPROVED') {
      return error(409, 'Your KYC is already approved. Contact support to update your video.')
    }

    const formData = await req.formData()
    const file = formData.get('video')

    if (!file || !(file instanceof File)) {
      return error(400, 'No video file provided')
    }

    // Validate MIME type
    if (!file.type || !file.type.startsWith('video/')) {
      return error(400, 'File must be a video (e.g. .webm, .mp4, .mov)')
    }

    // Validate file size (15 MB max)
    if (file.size > MAX_VIDEO_SIZE) {
      return error(400, `Video too large (max ${Math.round(MAX_VIDEO_SIZE / (1024 * 1024))}MB)`)
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Delete previous video if it exists
    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { kycVideoPath: true },
    })
    if (user?.kycVideoPath?.startsWith('/uploads/')) {
      const oldPath = path.join(process.cwd(), 'public', user.kycVideoPath)
      try {
        const { unlink } = await import('fs/promises')
        await unlink(oldPath)
      } catch {}
    }

    // Generate unique filename
    const ext = getVideoExtension(file.name, file.type)
    const uniqueName = `${crypto.randomUUID()}${ext}`
    const fullPath = path.join(UPLOAD_DIR, uniqueName)

    // Write file to disk
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    try {
      await writeFile(fullPath, buffer)
    } catch (writeErr: any) {
      console.error('[kyc video upload] Failed to write file:', writeErr)
      return error(500, 'Failed to save video to disk.')
    }

    const filePath = `/uploads/kyc/${uniqueName}`

    // Update user.kycVideoPath
    await db.user.update({
      where: { id: session.id },
      data: {
        kycVideoPath: filePath,
        kycStatus: userKycStatus === 'APPROVED' ? 'APPROVED' : 'PENDING',
      },
    })

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
          title: 'Liveness video uploaded',
          body: `${session.name || 'A provider'} uploaded a liveness verification video.`,
          link: 'kyc',
          isRead: false,
          read: false,
        },
      })
    }

    return json({
      kycVideoPath: filePath,
      kycStatus: userKycStatus === 'APPROVED' ? 'APPROVED' : 'PENDING',
    }, 201)
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/kyc/video
 * Removes the liveness video and clears kycVideoPath.
 */
export async function DELETE() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']
    if (!providerRoles.includes(session.role)) return error(403, 'Providers only')

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { kycVideoPath: true, kycStatus: true },
    })

    if (user?.kycStatus === 'APPROVED') {
      return error(409, 'Cannot remove video after KYC is approved.')
    }

    if (user?.kycVideoPath?.startsWith('/uploads/')) {
      const oldPath = path.join(process.cwd(), 'public', user.kycVideoPath)
      try {
        const { unlink } = await import('fs/promises')
        await unlink(oldPath)
      } catch {}
    }

    await db.user.update({
      where: { id: session.id },
      data: { kycVideoPath: null },
    })

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
