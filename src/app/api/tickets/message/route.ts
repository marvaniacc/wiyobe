import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { notify } from '@/lib/notify'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  ticketId: z.string(),
  message: z.string().min(1).max(2000),
})

// Add a message to a ticket
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, schema)

    const ticket = await db.ticket.findUnique({ where: { id: body.ticketId } })
    if (!ticket) return error(404, 'Ticket not found')

    const isAdmin = session.role === 'ADMIN'
    if (!isAdmin && ticket.userId !== session.id) return error(403, 'Forbidden')

    const msg = await db.ticketMessage.create({
      data: {
        ticketId: body.ticketId,
        senderId: session.id,
        message: body.message,
        isFromAdmin: isAdmin,
      },
    })

    // Update ticket status
    if (isAdmin && ticket.status === 'OPEN') {
      await db.ticket.update({ where: { id: body.ticketId }, data: { status: 'IN_PROGRESS' } })
    }

    // Notify the other party
    const notifyUserId = isAdmin ? ticket.userId : (await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } }))?.id
    if (notifyUserId) {
      await notify({
        userId: notifyUserId,
        type: 'system',
        title: isAdmin ? 'Admin replied to your ticket' : 'New message on ticket',
        body: body.message.slice(0, 100),
        link: 'tickets',
        meta: { ticketId: body.ticketId },
      })
    }

    return json({ message: msg }, 201)
  } catch (e) { return handleError(e) }
}
