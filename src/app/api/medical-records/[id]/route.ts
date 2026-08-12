import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  // The full new set of doctor ids that should have access. The endpoint
  // computes the diff (grant new / revoke removed) and applies it. An
  // empty array revokes all access. Omit the field to leave access unchanged.
  sharedWithDoctorIds: z.array(z.string()).optional(),
  notes: z.string().max(500).nullable().optional(),
})

/**
 * PATCH /api/medical-records/[id]
 *
 * Patients only. Updates a medical document's access list (grant/revoke
 * doctor access) and/or its notes.
 *
 * Authorization: the caller must own the document (patientId === session.id).
 *
 * The `sharedWithDoctorIds` array is treated as the desired final state —
 * the endpoint reconciles existing grants against it:
 *  - ids present in the array but not currently granted → grant added
 *  - ids currently granted but absent from the array → grant revoked
 * All doctor ids are validated to be real DOCTOR-role users first.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const { id } = await params
    const body = await parseBody(req, patchSchema)

    const doc = await db.medicalDocument.findUnique({ where: { id } })
    if (!doc || doc.patientId !== session.id) return error(404, 'Document not found')

    // Reconcile access grants if the caller supplied a new doctor id list.
    if (body.sharedWithDoctorIds !== undefined) {
      const desiredIds = [...new Set(body.sharedWithDoctorIds)]

      // Validate every id is a real, active doctor before granting.
      const validDoctors = desiredIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: desiredIds }, role: 'DOCTOR', status: 'ACTIVE' },
            select: { id: true },
          })
        : []
      const validIds = new Set(validDoctors.map((d) => d.id))

      // Existing grants for this document.
      const existing = await db.medicalRecordAccess.findMany({
        where: { documentId: id },
        select: { doctorId: true },
      })
      const existingIds = new Set(existing.map((g) => g.doctorId))

      const toGrant = [...validIds].filter((did) => !existingIds.has(did))
      const toRevoke = [...existingIds].filter((did) => !validIds.has(did))

      // Use the interactive $transaction callback so we can run the grant
      // and revoke operations conditionally (the array form requires every
      // element to be a valid Prisma promise and doesn't support
      // skipDuplicates on SQLite).
      await db.$transaction(async (tx) => {
        if (toGrant.length > 0) {
          // Filter out any ids that somehow already exist (race safety)
          // since createMany with skipDuplicates isn't supported on SQLite.
          for (const doctorId of toGrant) {
            await tx.medicalRecordAccess.upsert({
              where: { documentId_doctorId: { documentId: id, doctorId } },
              create: { documentId: id, doctorId },
              update: {},
            })
          }
        }
        if (toRevoke.length > 0) {
          await tx.medicalRecordAccess.deleteMany({
            where: { documentId: id, doctorId: { in: toRevoke } },
          })
        }
      })
    }

    // Update notes if provided.
    if (body.notes !== undefined) {
      await db.medicalDocument.update({
        where: { id },
        data: { notes: body.notes },
      })
    }

    const updated = await db.medicalDocument.findUnique({
      where: { id },
      include: {
        accessGrants: {
          select: { doctorId: true, grantedAt: true, doctor: { select: { id: true, name: true, email: true, doctor: { select: { specialty: true } } } } },
          orderBy: { grantedAt: 'desc' },
        },
      },
    })
    return json({ document: updated })
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/medical-records/[id]
 *
 * Patients only. Soft-deletes a medical document by setting `deletedAt` to
 * the current time. The document (and its access grants) remain in the DB
 * (recoverable from the recycle bin) but are hidden from all default
 * listings. The grants cascade only on a permanent delete.
 *
 * Authorization: the caller must own the document.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const { id } = await params
    const doc = await db.medicalDocument.findUnique({ where: { id, deletedAt: null } })
    if (!doc || doc.patientId !== session.id) return error(404, 'Document not found')

    await db.medicalDocument.update({ where: { id }, data: { deletedAt: new Date() } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
