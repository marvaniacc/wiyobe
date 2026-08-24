import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { error, handleError } from '@/lib/api'
import { readFile, stat } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

// Private KYC storage root — outside public/, never served statically.
const UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'kyc')
const PUBLIC_URL_PREFIX = '/api/kyc/file/'

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
}

/**
 * GET /api/kyc/file/[name]
 *
 * Authenticated access to a stored KYC document. Only the document owner or
 * an admin may fetch it. The stored KycDocument row is resolved by matching
 * the current URL form (/api/kyc/file/<name>) or the legacy form
 * (/uploads/kyc/<name>) so pre-migration records keep working.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { name: rawName } = await params
    // Path-traversal guard: only a bare filename is accepted.
    const name = path.basename(rawName)
    if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
      return error(400, 'Invalid file name')
    }

    const doc = await db.kycDocument.findFirst({
      where: {
        OR: [
          { dataUrl: `${PUBLIC_URL_PREFIX}${name}` },
          { dataUrl: `/uploads/kyc/${name}` },
        ],
      },
      select: { id: true, userId: true, fileType: true },
    })
    if (!doc) return error(404, 'Document not found')
    // Owner or admin only
    if (doc.userId !== session.id && session.role !== 'ADMIN') return error(404, 'Document not found')

    const fullPath = path.join(UPLOAD_DIR, name)
    try {
      await stat(fullPath)
    } catch {
      return error(404, 'File missing')
    }
    const buffer = await readFile(fullPath)

    const ext = path.extname(name).toLowerCase()
    const contentType = doc.fileType || MIME_BY_EXT[ext] || 'application/octet-stream'
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        // Never let browsers guess another type (XSS hardening) and never cache
        // identity documents in shared caches.
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `inline; filename="${name}"`,
      },
    })
  } catch (e) { return handleError(e) }
}
