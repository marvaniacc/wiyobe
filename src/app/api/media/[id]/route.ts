import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/media/[id]
 *
 * Soft-deletes a media asset by setting `deletedAt` to the current time. The
 * DB record remains (recoverable from the recycle bin) but is hidden from all
 * default listings.
 *
 * Per the soft-delete spec, the file on disk is intentionally NOT removed
 * during soft delete — it stays on disk so the asset can be restored from
 * the recycle bin. The file will be removed only when the asset is
 * permanently purged from the recycle bin (a follow-up task).
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
    const asset = await db.mediaAsset.findUnique({ where: { id, deletedAt: null } })
    if (!asset) return error(404, 'Asset not found')

    // Ownership check (admins bypass)
    if (session.role !== 'ADMIN' && asset.uploaderId !== session.id) {
      return error(403, 'You can only delete your own uploads')
    }

    // Soft delete only — the file on disk stays so the asset can be restored
    // from the recycle bin. Permanent purge (DB delete + file unlink) will be
    // handled by a separate recycle-bin endpoint.
    await db.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
