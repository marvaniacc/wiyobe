import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { notify } from '@/lib/notify'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  disputeId: z.string(),
  action: z.enum(['review', 'resolve', 'close']),
  adminResponse: z.string().optional(),
})

// Admin resolves or closes a dispute
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, schema)

    const dispute = await db.dispute.findUnique({
      where: { id: body.disputeId },
      include: { booking: true },
    })
    if (!dispute) return error(404, 'Dispute not found')

    let newStatus: string = dispute.status
    let resolvedAt: Date | null = dispute.resolvedAt
    let resolvedById: string | null = dispute.resolvedById

    if (body.action === 'review') {
      newStatus = 'UNDER_REVIEW'
    } else if (body.action === 'resolve') {
      newStatus = 'RESOLVED'
      resolvedAt = new Date()
      resolvedById = session.id
    } else if (body.action === 'close') {
      newStatus = 'CLOSED'
      resolvedAt = new Date()
      resolvedById = session.id
    }

    const updated = await db.dispute.update({
      where: { id: body.disputeId },
      data: {
        status: newStatus as any,
        adminResponse: body.adminResponse || dispute.adminResponse,
        resolvedAt,
        resolvedById,
      },
    })

    // Notify both parties about the status change
    const message = body.action === 'resolve' ? 'Your dispute has been resolved' :
                    body.action === 'close' ? 'Your dispute has been closed' :
                    'Your dispute is now under review'

    await notify({
      userId: dispute.raisedById,
      type: 'system',
      title: 'Dispute update',
      body: `${message}${body.adminResponse ? ': ' + body.adminResponse : ''}`,
      link: 'disputes',
      meta: { disputeId: dispute.id },
    })
    await notify({
      userId: dispute.againstUserId,
      type: 'system',
      title: 'Dispute update',
      body: `${message}${body.adminResponse ? ': ' + body.adminResponse : ''}`,
      link: 'disputes',
      meta: { disputeId: dispute.id },
    })

    return json({ dispute: updated })
  } catch (e) { return handleError(e) }
}
