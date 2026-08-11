import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET /api/medical-records/recycle-bin
 *
 * Patient only. Returns the caller's soft-deleted medical documents
 * (deletedAt IS NOT NULL, patientId === session.id). Patients cannot see
 * other patients' or admin's deleted items.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const documents = await db.medicalDocument.findMany({
      where: {
        patientId: session.id,
        deletedAt: { not: null, gte: thirtyDaysAgo },
      },
      orderBy: { deletedAt: 'desc' },
      include: {
        accessGrants: {
          select: { doctorId: true },
        },
      },
    })

    return json({ documents })
  } catch (e) { return handleError(e) }
}

const restoreSchema = z.object({
  id: z.string(),
})

/**
 * PATCH /api/medical-records/recycle-bin
 *
 * Patient only. Restores a soft-deleted medical document by setting
 * deletedAt back to null. The document must belong to the caller.
 */
export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const body = await parseBody(req, restoreSchema)
    const { id } = body

    // Verify ownership before restoring
    const doc = await db.medicalDocument.findUnique({ where: { id } })
    if (!doc || doc.patientId !== session.id) return error(404, 'Document not found')

    await db.medicalDocument.update({
      where: { id },
      data: { deletedAt: null },
    })

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/medical-records/recycle-bin?id=xxx
 *
 * Patient only. Permanently deletes a soft-deleted medical document and
 * its associated access grants (cascade). The document must belong to the
 * caller. The base64 dataUrl is cleared by virtue of the row being deleted,
 * which frees up DB space.
 */
export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')

    // Verify ownership before permanent deletion
    const doc = await db.medicalDocument.findUnique({ where: { id } })
    if (!doc || doc.patientId !== session.id) return error(404, 'Document not found')

    // Permanently delete — access grants cascade via onDelete: Cascade
    await db.medicalDocument.delete({ where: { id } })

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
