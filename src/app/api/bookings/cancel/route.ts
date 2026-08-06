import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { getCancellationPolicy, resolveProviderUser, recordRefundLedger } from '@/lib/ledger'
import { subDec, toDec } from '@/lib/money'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  bookingId: z.string(),
  reason: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, schema)

    const booking = await db.booking.findUnique({
      where: { id: body.bookingId },
      include: { payment: true },
    })
    if (!booking) return error(404, 'Booking not found')

    // patient can cancel their own; provider can cancel bookings they receive; admin can cancel any
    const isPatient = booking.patientId === session.id
    const providerUserId = await resolveProviderUser(booking)
    const isProvider = providerUserId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isPatient && !isProvider && !isAdmin) return error(403, 'Forbidden')

    if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
      return error(409, 'Booking already cancelled')
    }

    // Cancellation fee logic: if within free window, full refund; else partial with fee retained
    const policy = await getCancellationPolicy(booking.providerType)
    const hoursUntil = (booking.startDate.getTime() - Date.now()) / 3600000
    const withinFreeWindow = hoursUntil >= policy.freeCancellationHours
    const feePercent = withinFreeWindow ? 0 : parseFloat(policy.cancellationFeePercent)
    const paidAmount = parseFloat(booking.amount)
    const refundAmount = (paidAmount * (1 - feePercent / 100)).toFixed(2)
    const feeRetained = subDec(booking.amount, refundAmount)

    // Process refund through Stripe (mock — real impl: stripe.refunds.create)
    await db.payment.update({
      where: { bookingId: booking.id },
      data: {
        status: feeRetained === '0.00' ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        refundAmount: toDec(refundAmount),
      },
    })

    // Release slot
    if (booking.slotId) {
      await db.slot.update({ where: { id: booking.slotId }, data: { isBooked: false } })
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancellationReason: body.reason || 'Cancelled by user',
        cancelledById: session.id,
        cancelledAt: new Date(),
        refundAmount: toDec(refundAmount),
      },
    })

    // Refund ledger entries
    if (booking.payment && providerUserId) {
      await recordRefundLedger({
        bookingId: booking.id,
        paymentId: booking.payment.id,
        refundAmount: toDec(refundAmount),
        commissionRate: booking.commissionRate,
        providerUserId,
        originalAmount: booking.amount,
        description: `Refund on cancellation (fee retained: ${feeRetained})`,
      })
    }

    return json({ booking: updated, refundAmount, feeRetained, withinFreeWindow })
  } catch (e) { return handleError(e) }
}
