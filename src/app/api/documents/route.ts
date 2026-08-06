import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const docs = await db.medicalDocument.findMany({
      where: { patientId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return json({ documents: docs })
  } catch (e) { return handleError(e) }
}

const schema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string(),
  fileSize: z.number().int().positive().max(5_000_000), // max 5MB
  category: z.enum(['prescription', 'test_result', 'insurance', 'passport', 'other']),
  dataUrl: z.string().refine(
    (v) => v.startsWith('data:') && v.length < 7_000_000, // ~5MB base64
    'File too large (max 5MB)'
  ),
  notes: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')
    const body = await parseBody(req, schema)

    const doc = await db.medicalDocument.create({
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
    return json({ document: doc }, 201)
  } catch (e) { return handleError(e) }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')

    const doc = await db.medicalDocument.findUnique({ where: { id } })
    if (!doc || doc.patientId !== session.id) return error(404, 'Document not found')

    await db.medicalDocument.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
