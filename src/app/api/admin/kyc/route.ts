import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Admin: list all KYC documents
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const docs = await db.kycDocument.findMany({
      include: { user: { select: { id: true, name: true, email: true, doctor: { select: { specialty: true } } } } },
      orderBy: { createdAt: 'desc' },
    })
    return json({ documents: docs })
  } catch (e) { return handleError(e) }
}

const reviewSchema = z.object({
  documentId: z.string(),
  action: z.enum(['approve', 'reject']),
  adminNote: z.string().optional(),
})

// Admin: approve or reject KYC document
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, reviewSchema)

    const doc = await db.kycDocument.findUnique({ where: { id: body.documentId } })
    if (!doc) return error(404, 'Document not found')

    await db.kycDocument.update({
      where: { id: body.documentId },
      data: {
        status: body.action === 'approve' ? 'APPROVED' : 'REJECTED',
        adminNote: body.adminNote || null,
        reviewedById: session.id,
        reviewedAt: new Date(),
      },
    })

    // If approved, mark doctor as verified
    if (body.action === 'approve') {
      const user = await db.user.findUnique({ where: { id: doc.userId }, include: { doctor: true } })
      if (user?.doctor) {
        // Check if all required docs are approved
        const allDocs = await db.kycDocument.findMany({ where: { userId: doc.userId } })
        const requiredTypes = ['medical_license', 'id_card']
        const allApproved = requiredTypes.every(t => allDocs.some(d => d.docType === t && d.status === 'APPROVED'))
        if (allApproved) {
          await db.doctor.update({ where: { id: user.doctor.id }, data: { verified: true } })
          await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } })
        }
      }
    }

    // Notify doctor
    await db.notification.create({
      data: {
        userId: doc.userId,
        type: 'system',
        title: body.action === 'approve' ? 'KYC document approved' : 'KYC document rejected',
        body: body.action === 'approve'
          ? `Your ${doc.docType.replace(/_/g, ' ')} has been approved.`
          : `Your ${doc.docType.replace(/_/g, ' ')} was rejected. ${body.adminNote || 'Please resubmit.'}`,
        link: 'kyc',
      },
    })

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
