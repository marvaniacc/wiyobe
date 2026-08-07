import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Get KYC documents for the current user (doctor)
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const docs = await db.kycDocument.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return json({ documents: docs })
  } catch (e) { return handleError(e) }
}

const uploadSchema = z.object({
  docType: z.enum(['medical_license', 'id_card', 'diploma', 'passport', 'other']),
  fileName: z.string().min(1).max(255),
  fileType: z.string(),
  fileSize: z.number().int().positive().max(5_000_000),
  dataUrl: z.string().refine(v => v.startsWith('data:') && v.length < 7_000_000, 'File too large'),
  notes: z.string().max(500).optional(),
})

// Upload a KYC document
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'DOCTOR') return error(403, 'Only doctors can submit KYC')
    const body = await parseBody(req, uploadSchema)

    const doc = await db.kycDocument.create({
      data: {
        userId: session.id,
        docType: body.docType,
        fileName: body.fileName,
        fileType: body.fileType,
        fileSize: body.fileSize,
        dataUrl: body.dataUrl,
        notes: body.notes,
        status: 'PENDING',
      },
    })

    // Notify admins
    const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })
    for (const admin of admins) {
      await db.notification.create({
        data: {
          userId: admin.id,
          type: 'system',
          title: 'New KYC document submitted',
          body: `A doctor has submitted a ${body.docType.replace(/_/g, ' ')} for verification.`,
          link: 'kyc',
        },
      })
    }

    return json({ document: doc }, 201)
  } catch (e) { return handleError(e) }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')
    const doc = await db.kycDocument.findUnique({ where: { id } })
    if (!doc || doc.userId !== session.id) return error(404, 'Not found')
    if (doc.status === 'APPROVED') return error(409, 'Cannot delete approved document')
    await db.kycDocument.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
