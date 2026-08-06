import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({ bookingId: z.string() })

// Mark a booking as completed — releases the provider's pending credit into available balance.
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { bookingId } = await parseBody(req, schema)

    const booking = await db.booking.findUnique({ where: { id: bookingId } })
    if (!booking) return error(404, 'Booking not found')

    const providerUserId = await (await import('@/lib/ledger')).resolveProviderUser(booking)
    const isProvider = providerUserId === session.id
    const isAdmin = session.role === 'ADMIN'
    const isPatient = booking.patientId === session.id
    if (!isProvider && !isAdmin && !isPatient) return error(403, 'Forbidden')
    if (booking.status !== 'CONFIRMED') return error(409, 'Only confirmed bookings can be completed')

    const updated = await db.booking.update({
      where: { id: bookingId },
      data: { status: 'COMPLETED', endDate: new Date() },
    })
    return json({ booking: updated })
  } catch (e) { return handleError(e) }
}
