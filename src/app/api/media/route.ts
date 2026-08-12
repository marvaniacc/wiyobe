import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/** Allowed MIME types — images, PDFs, and common document formats. */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
])

/** Extract file extension from a filename or MIME type. */
function getExtension(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName)
  if (fromName) return fromName
  // Fallback: derive from MIME type
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/csv': '.csv',
  }
  return map[mimeType] || ''
}

/**
 * GET /api/media
 *
 * Returns media assets. Admins see all uploads; other roles see only their own.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const where = session.role === 'ADMIN'
      ? { deletedAt: null }
      : { uploaderId: session.id, deletedAt: null }
    const assets = await db.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
    })
    return json({ assets })
  } catch (e) { return handleError(e) }
}

/**
 * POST /api/media
 *
 * Accepts multipart/form-data with a `file` field. Saves the file to
 * `public/uploads/` with a unique name (UUID + extension), creates a
 * MediaAsset record, and returns the asset data including the public
 * `filePath` that can be used in <img src=...> or similar.
 *
 * Restrictions: max 5MB, allowed MIME types only (images, PDFs, documents).
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return error(400, 'No file provided')
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return error(400, `File type "${file.type}" is not allowed. Allowed: images, PDFs, documents.`)
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return error(400, 'File too large (max 5MB)')
    }

    // Ensure the uploads directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate a unique filename: UUID + original extension
    const ext = getExtension(file.name, file.type)
    const uniqueName = `${crypto.randomUUID()}${ext}`
    const fullPath = path.join(UPLOAD_DIR, uniqueName)

    // Write the file to disk
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    try {
      await writeFile(fullPath, buffer)
    } catch (writeErr: any) {
      console.error('[media upload] Failed to write file:', writeErr)
      return error(500, 'Failed to save file to disk. Please try again.')
    }

    // The public-facing path (relative to public/)
    const filePath = `/uploads/${uniqueName}`

    // Create the DB record
    const asset = await db.mediaAsset.create({
      data: {
        uploaderId: session.id,
        fileName: file.name,
        filePath,
        mimeType: file.type,
        fileSize: file.size,
      },
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
    })

    return json({ asset }, 201)
  } catch (e) { return handleError(e) }
}
