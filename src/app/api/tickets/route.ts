import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { notify } from '@/lib/notify'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Get tickets for the current user (or all for admin)
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let where: any = {}
    if (session.role === 'ADMIN') {
      if (status) where.status = status
    } else {
      where.userId = session.id
      if (status) where.status = status
    }

    const tickets = await db.ticket.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })

    return json({ tickets })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  category: z.enum(['booking', 'payment', 'account', 'technical', 'other']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
})

// Create a new ticket
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, createSchema)

    const ticket = await db.ticket.create({
      data: {
        userId: session.id,
        subject: body.subject,
        description: body.description,
        category: body.category,
        priority: body.priority,
        status: 'OPEN',
        messages: {
          create: {
            senderId: session.id,
            message: body.description,
            isFromAdmin: false,
          },
        },
      },
      include: { messages: true },
    })

    // Notify admins
    const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        type: 'system',
        title: 'New support ticket',
        body: `${session.name || 'A user'} created a ticket: ${body.subject}`,
        link: 'tickets',
        meta: { ticketId: ticket.id },
      })
    }

    return json({ ticket }, 201)
  } catch (e) { return handleError(e) }
}
