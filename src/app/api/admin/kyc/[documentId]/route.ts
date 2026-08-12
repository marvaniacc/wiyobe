import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import { sendNotification } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(500).optional(),
})

/**
 * PATCH /api/admin/kyc/[documentId]
 *
 * Admin only. Approves or rejects a single KYC document. Sets the
 * reviewer, review timestamp, and rejection reason (if rejected).
 * Sends a notification to the provider.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { documentId } = await params
    const body = await parseBody(req, reviewSchema)

    const doc = await db.kycDocument.findUnique({
      where: { id: documentId },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!doc) return error(404, 'Document not found')

    // Validate rejection reason is provided when rejecting
    if (body.status === 'REJECTED' && !body.rejectionReason?.trim()) {
      return error(400, 'A rejection reason is required when rejecting a document')
    }

    // Update the document
    const updated = await db.kycDocument.update({
      where: { id: documentId },
      data: {
        reviewStatus: body.status,
        status: body.status as any, // legacy field
        rejectionReason: body.status === 'REJECTED' ? body.rejectionReason!.trim() : null,
        adminNote: body.status === 'REJECTED' ? body.rejectionReason!.trim() : null,
        reviewedById: session.id,
        reviewedAt: new Date(),
      },
    })

    // Send notification to the provider
    const docName = doc.documentName || doc.docType || 'Document'
    if (body.status === 'APPROVED') {
      await sendNotification({
        userId: doc.userId,
        title: 'Document Approved',
        message: `Your document "${docName}" has been approved.`,
        category: 'KYC',
        type: 'kyc_approved',
        link: 'kyc',
        metadata: { documentId },
      })
    } else {
      await sendNotification({
        userId: doc.userId,
        title: 'Document Rejected',
        message: `Your document "${docName}" was rejected. Reason: ${body.rejectionReason}`,
        category: 'KYC',
        type: 'kyc_rejected',
        link: 'kyc',
        metadata: { documentId, rejectionReason: body.rejectionReason },
      })
    }

    return json({ document: updated })
  } catch (e) { return handleError(e) }
}
