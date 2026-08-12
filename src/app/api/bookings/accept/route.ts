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
        doctor: { include: { user: { select: { name: true } } } },
        hospital: { select: { name: true } },
        hotel: { select: { name: true } },
        translator: { include: { user: { select: { name: true } } } },
        patient: { select: { name: true } },
      },
    })
    if (!booking) return error(404, 'Booking not found')

    // Only the assigned provider or an admin can accept
    const providerUserId = await resolveProviderUser(booking)
    const isProvider = providerUserId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isProvider && !isAdmin) return error(403, 'Only the assigned provider can accept this booking')

    if (booking.status !== 'PENDING') {
      return error(409, `Booking is already ${booking.status}. Only PENDING bookings can be accepted.`)
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED' },
    })

    // Notify the patient
    const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'
    await notify({
      userId: booking.patientId,
      type: 'booking_accepted',
      title: 'Booking accepted! ✅',
      body: `${providerName} has accepted your booking. The appointment is now confirmed.`,
      link: 'bookings',
      meta: { bookingId: booking.id },
    })

    // Send email to patient
    const { sendEmail, bookingAcceptedEmail } = await import('@/lib/email')
    const patientUser = await db.user.findUnique({ where: { id: booking.patientId }, select: { name: true, email: true } })
    if (patientUser) {
      const tpl = bookingAcceptedEmail(patientUser.name || 'Patient', providerName)
      await sendEmail({ to: patientUser.email, subject: tpl.subject, html: tpl.html })
    }

    return json({ booking: updated })
  } catch (e) { return handleError(e) }
}
