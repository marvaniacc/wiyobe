import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  ticketId: z.string(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
})

// Admin: update ticket status
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, schema)

    const ticket = await db.ticket.update({
      where: { id: body.ticketId },
      data: { status: body.status },
    })

    // Notify the ticket owner
    await db.notification.create({
      data: {
        userId: ticket.userId,
        type: 'system',
        title: `Ticket ${body.status.toLowerCase()}`,
        body: `Your ticket "${ticket.subject}" has been ${body.status.toLowerCase()}.`,
        link: 'tickets',
      },
    })

    return json({ ticket })
  } catch (e) { return handleError(e) }
}
