import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { unlink } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/media/[id]
 *
 * Deletes a media asset — both the file on disk and the DB record.
 *
 * Authorization:
 *  - Admins can delete any asset.
 *  - Other users can only delete assets they uploaded.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { id } = await params
    const asset = await db.mediaAsset.findUnique({ where: { id } })
    if (!asset) return error(404, 'Asset not found')

    // Ownership check (admins bypass)
    if (session.role !== 'ADMIN' && asset.uploaderId !== session.id) {
      return error(403, 'You can only delete your own uploads')
    }

    // Delete the file from disk. Gracefully handle missing files (the DB
    // record is still deleted so we don't leak orphans).
    const fullPath = path.join(process.cwd(), 'public', asset.filePath)
    try {
      await unlink(fullPath)
    } catch (fsErr: any) {
      // File may already be gone — log and continue to delete the DB record.
      if (fsErr.code !== 'ENOENT') {
        console.error('[media delete] Failed to delete file:', fsErr)
      }
    }

    await db.mediaAsset.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
