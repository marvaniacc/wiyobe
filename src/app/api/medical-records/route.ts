import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET /api/medical-records
 *
 * Role-aware listing of medical documents:
 *  - PATIENT: returns all of the caller's own documents, with the list of
 *    doctor ids each document has been shared with.
 *  - DOCTOR / HOSPITAL: returns only documents that a patient has
 *    explicitly granted this user access to (via MedicalRecordAccess).
 *    The dataUrl is included so the doctor can view/download the file.
 *  - Other roles: 403.
 *
 * Authorization is enforced at the database query level — a doctor can
 * never fetch a document they were not granted access to.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    if (session.role === 'PATIENT') {
      const docs = await db.medicalDocument.findMany({
        where: { patientId: session.id },
        include: {
          accessGrants: {
            select: { doctorId: true, grantedAt: true, doctor: { select: { id: true, name: true, email: true, doctor: { select: { specialty: true } } } } },
            orderBy: { grantedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      return json({ documents: docs })
    }

    // Provider (DOCTOR / HOSPITAL) — only docs explicitly shared with them.
    if (session.role === 'DOCTOR' || session.role === 'HOSPITAL') {
      const accessRecords = await db.medicalRecordAccess.findMany({
        where: { doctorId: session.id },
        include: {
          document: {
            include: {
              patient: { select: { id: true, name: true, email: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { grantedAt: 'desc' },
      })
      // Flatten to a document-centric list, attaching the patient + grantedAt.
      const documents = accessRecords.map((ar) => ({
        id: ar.document.id,
        patientId: ar.document.patientId,
        fileName: ar.document.fileName,
        fileType: ar.document.fileType,
        fileSize: ar.document.fileSize,
        category: ar.document.category,
        dataUrl: ar.document.dataUrl,
        notes: ar.document.notes,
        createdAt: ar.document.createdAt,
        patient: ar.document.patient,
        grantedAt: ar.grantedAt,
      }))
      return json({ documents })
    }

    return error(403, 'Forbidden')
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().max(100),
  fileSize: z.number().int().positive().max(5_000_000), // 5 MB cap
  category: z.enum(['prescription', 'test_result', 'insurance', 'passport', 'other']),
  dataUrl: z.string().refine(
    (v) => v.startsWith('data:') && v.length < 7_000_000,
    'File too large (max 5MB)'
  ),
  notes: z.string().max(500).optional(),
  // Optional: grant access to specific doctors immediately on upload.
  sharedWithDoctorIds: z.array(z.string()).optional(),
})

/**
 * POST /api/medical-records
 *
 * Patients only. Creates a new medical document (base64 dataUrl, same as
 * the existing /api/documents endpoint) and optionally grants access to a
 * list of doctors in the same transaction.
 *
 * The `sharedWithDoctorIds` are validated to be actual DOCTOR-role users
 * before access grants are created — a patient cannot grant access to
 * another patient or to a non-existent user.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const body = await parseBody(req, createSchema)

    // Validate that any doctor ids in sharedWithDoctorIds are real doctors.
    let doctorIds: string[] = []
    if (body.sharedWithDoctorIds && body.sharedWithDoctorIds.length > 0) {
      const uniqueIds = [...new Set(body.sharedWithDoctorIds)]
      const doctors = await db.user.findMany({
        where: { id: { in: uniqueIds }, role: 'DOCTOR', status: 'ACTIVE' },
        select: { id: true },
      })
      doctorIds = doctors.map((d) => d.id)
    }

    // Create the document + any access grants in a single transaction so
    // we never end up with a document but missing grants (or vice versa).
    const doc = await db.$transaction(async (tx) => {
      const created = await tx.medicalDocument.create({
        data: {
          patientId: session.id,
          fileName: body.fileName,
          fileType: body.fileType,
          fileSize: body.fileSize,
          category: body.category,
          dataUrl: body.dataUrl,
          notes: body.notes,
        },
      })
      if (doctorIds.length > 0) {
        // createMany with skipDuplicates isn't supported on SQLite, so
        // grant access one-by-one. The document was just created so there
        // are no existing grants to conflict with.
        for (const doctorId of doctorIds) {
          await tx.medicalRecordAccess.create({
            data: { documentId: created.id, doctorId },
          })
        }
      }
      return created
    })

    const result = await db.medicalDocument.findUnique({
      where: { id: doc.id },
      include: { accessGrants: { select: { doctorId: true } } },
    })
    return json({ document: result }, 201)
  } catch (e) { return handleError(e) }
}
