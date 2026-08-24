import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { resolveProviderUser } from '@/lib/ledger'
import { notify } from '@/lib/notify'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  bookingId: z.string(),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, schema)

    const booking = await db.booking.findUnique({
      where: { id: body.bookingId },
      include: {
        payment: true,
        doctor: { include: { user: { select: { name: true } } } },
        hospital: { select: { name: true } },
        hotel: { select: { name: true } },
        translator: { include: { user: { select: { name: true } } } },
      },
    })
    if (!booking) return error(404, 'Booking not found')

    // Only the assigned provider or an admin can mark no-show
    const providerUserId = await resolveProviderUser(booking)
    const isProvider = providerUserId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isProvider && !isAdmin) return error(403, 'Only the assigned provider can mark this booking as no-show')

    if (booking.status !== 'CONFIRMED') {
      return error(409, `Booking is ${booking.status}. Only CONFIRMED bookings can be marked as no-show.`)
    }

    const bumped = await db.booking.updateMany({
      where: { id: booking.id, status: 'CONFIRMED' },
      data: {
        status: 'NO_SHOW',
        endDate: new Date(),
      },
    })
    if (bumped.count === 0) return error(409, 'Booking was already processed by someone else')


    // Financial logic: the provider should not receive credit for a no-show.
    // Create a REFUND_PROVIDER_DEBIT ledger entry to reverse the PROVIDER_CREDIT
    // that was created at booking finalization. This is a negative amount that
    // reduces the provider's available balance.
    if (providerUserId && booking.providerNetAmount) {
      await db.ledgerEntry.create({
        data: {
          bookingId: booking.id,
          paymentId: booking.payment?.id,
          userId: providerUserId,
          type: 'REFUND_PROVIDER_DEBIT',
          amount: `-${booking.providerNetAmount}`, // negative — reverses the credit
          description: `Provider credit reversed — patient no-show`,
        },
      })
    }

    // Notify the patient
    const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'
    await notify({
      userId: booking.patientId,
      type: 'booking_no_show',
      title: 'Booking marked as no-show',
      body: `${providerName} has marked your booking as no-show. Please contact the provider if this is an error.`,
      link: 'bookings',
      meta: { bookingId: booking.id },
    })

    return json({ booking: { ...booking, status: 'NO_SHOW' } })
  } catch (e) { return handleError(e) }
}
