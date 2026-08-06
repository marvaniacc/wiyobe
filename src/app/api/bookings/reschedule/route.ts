import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { notify } from '@/lib/notify'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  bookingId: z.string(),
  newSlotId: z.string(),
})

// Patient reschedules a booking to a new slot
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { bookingId, newSlotId } = await parseBody(req, schema)

    const booking = await db.booking.findUnique({ where: { id: bookingId } })
    if (!booking) return error(404, 'Booking not found')
    if (booking.patientId !== session.id) return error(403, 'Only the patient can reschedule')
    if (booking.status !== 'CONFIRMED') return error(409, 'Only confirmed bookings can be rescheduled')

    const newSlot = await db.slot.findUnique({ where: { id: newSlotId } })
    if (!newSlot || newSlot.isBooked) return error(409, 'Selected slot is not available')

    // Verify the new slot belongs to the same provider
    const providerMatch =
      (booking.providerType === 'DOCTOR' && newSlot.doctorId === booking.doctorId) ||
      (booking.providerType === 'HOSPITAL' && newSlot.hospitalId === booking.hospitalId) ||
      (booking.providerType === 'TRANSLATOR' && newSlot.translatorId === booking.translatorId)
    if (!providerMatch) return error(400, 'Slot does not belong to the same provider')

    // Free old slot
    if (booking.slotId) {
      await db.slot.update({ where: { id: booking.slotId }, data: { isBooked: false } })
    }

    // Book new slot
    await db.slot.update({ where: { id: newSlotId }, data: { isBooked: true } })

    // Update booking
    const updated = await db.booking.update({
      where: { id: bookingId },
      data: {
        slotId: newSlotId,
        startDate: newSlot.startTime,
        endDate: newSlot.endTime,
        visitType: newSlot.visitType,
      },
    })

    // Notify provider
    const { resolveProviderUser } = await import('@/lib/ledger')
    const providerUserId = await resolveProviderUser(booking)
    if (providerUserId) {
      await notify({
        userId: providerUserId,
        type: 'system',
        title: 'Booking rescheduled',
        body: `A patient rescheduled their booking to ${newSlot.startTime.toLocaleString()}.`,
        link: 'appointments',
        meta: { bookingId },
      })
    }

    return json({ booking: updated })
  } catch (e) { return handleError(e) }
}
