import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { notify } from '@/lib/notify'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let where: any = {}
    if (session.role === 'ADMIN') {
      // Admin sees all disputes
      if (status) where.status = status
    } else {
      // Users see disputes they raised or are against them
      where = {
        OR: [{ raisedById: session.id }, { againstUserId: session.id }],
      }
      if (status) where.status = status
    }

    const disputes = await db.dispute.findMany({
      where,
      include: {
        booking: {
          select: {
            id: true, startDate: true, amount: true, providerType: true,
            patient: { select: { name: true } },
            doctor: { include: { user: { select: { name: true } } } },
            hospital: { select: { name: true } },
            hotel: { select: { name: true } },
            translator: { include: { user: { select: { name: true } } } },
          },
        },
        raisedBy: { select: { id: true, name: true, email: true, role: true } },
        againstUser: { select: { id: true, name: true, email: true, role: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return json({ disputes })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  bookingId: z.string(),
  type: z.enum(['REFUND_REQUEST', 'SERVICE_QUALITY', 'SCHEDULING_ISSUE', 'PAYMENT_ISSUE', 'OTHER']),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, createSchema)

    const booking = await db.booking.findUnique({ where: { id: body.bookingId } })
    if (!booking) return error(404, 'Booking not found')

    // Determine who the dispute is against
    const { resolveProviderUser } = await import('@/lib/ledger')
    const providerUserId = await resolveProviderUser(booking)
    if (!providerUserId) return error(400, 'Could not resolve provider')

    // The patient raises dispute against provider, or provider against patient
    const isPatient = booking.patientId === session.id
    const isProvider = providerUserId === session.id
    if (!isPatient && !isProvider) return error(403, 'Forbidden')

    const raisedById = session.id
    const againstUserId = isPatient ? providerUserId : booking.patientId

    // Check for existing open dispute on this booking
    const existing = await db.dispute.findFirst({
      where: { bookingId: body.bookingId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    })
    if (existing) return error(409, 'An active dispute already exists for this booking')

    const dispute = await db.dispute.create({
      data: {
        bookingId: body.bookingId,
        raisedById,
        againstUserId,
        type: body.type,
        title: body.title,
        description: body.description,
      },
    })

    // Notify the other party
    await notify({
      userId: againstUserId,
      type: 'system',
      title: 'A dispute has been opened',
      body: `A dispute has been raised regarding your booking. Title: ${body.title}`,
      link: 'disputes',
      meta: { disputeId: dispute.id, bookingId: body.bookingId },
    })

    // Notify admins
    const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })
    for (const admin of admins) {
      await notify({
        userId: admin.id,
        type: 'system',
        title: 'New dispute opened',
        body: `${session.name || 'A user'} opened a dispute: ${body.title}`,
        link: 'disputes',
        meta: { disputeId: dispute.id },
      })
    }

    return json({ dispute }, 201)
  } catch (e) { return handleError(e) }
}
