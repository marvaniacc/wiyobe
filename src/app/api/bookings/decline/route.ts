import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { resolveProviderUser, recordRefundLedger } from '@/lib/ledger'
import { notify } from '@/lib/notify'
import { toDec } from '@/lib/money'
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
      include: {
        payment: true,
        doctor: { include: { user: { select: { name: true } } } },
        hospital: { select: { name: true } },
        hotel: { select: { name: true } },
        translator: { include: { user: { select: { name: true } } } },
      },
    })
    if (!booking) return error(404, 'Booking not found')

    // Only the assigned provider or an admin can decline
    const providerUserId = await resolveProviderUser(booking)
    const isProvider = providerUserId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isProvider && !isAdmin) return error(403, 'Only the assigned provider can decline this booking')

    if (booking.status !== 'PENDING') {
      return error(409, `Booking is already ${booking.status}. Only PENDING bookings can be declined.`)
    }

    const refundAmount = booking.amount // Full refund on decline

    // Update payment to REFUNDED
    await db.payment.update({
      where: { bookingId: booking.id },
      data: {
        status: 'REFUNDED',
        refundAmount: toDec(refundAmount),
      },
    })

    // Release the slot
    if (booking.slotId) {
      await db.slot.update({ where: { id: booking.slotId }, data: { isBooked: false } })
    }

    // Process refund through Stripe if configured
    if (booking.payment?.stripeChargeId && !booking.payment.stripeChargeId.startsWith('ch_mock_')) {
      const { refundPayment } = await import('@/lib/stripe')
      const refund = await refundPayment(booking.payment.stripeChargeId, parseFloat(refundAmount))
      if (refund) {
        console.log(`Refund processed: ${refund.id} for $${refund.amount}`)
      }
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancellationReason: body.reason || 'Declined by provider',
        cancelledById: session.id,
        cancelledAt: new Date(),
        refundAmount: toDec(refundAmount),
      },
    })

    // Refund ledger entries (same logic as cancel route)
    if (booking.payment && providerUserId) {
      await recordRefundLedger({
        bookingId: booking.id,
        paymentId: booking.payment.id,
        refundAmount: toDec(refundAmount),
        commissionRate: booking.commissionRate,
        providerUserId,
        originalAmount: booking.amount,
        description: `Full refund on provider decline (reason: ${body.reason || 'N/A'})`,
      })
    }

    // === Affiliate commission reversal ===
    if (booking.affiliateId && booking.affiliateAmount && parseFloat(booking.affiliateAmount) > 0) {
      const aff = await db.affiliate.findUnique({ where: { userId: booking.affiliateId } })
      if (aff) {
        const commissionAmount = parseFloat(booking.affiliateAmount)
        // Booking was PENDING (not COMPLETED), so reverse from pendingBalance
        const newPending = Math.max(0, parseFloat(aff.pendingBalance) - commissionAmount).toFixed(2)
        const newTotalEarnings = Math.max(0, parseFloat(aff.totalEarnings) - commissionAmount).toFixed(2)
        await db.affiliate.update({
          where: { userId: booking.affiliateId },
          data: { pendingBalance: newPending, totalEarnings: newTotalEarnings },
        })

        // Create reversal ledger entry
        if (booking.payment) {
          await db.ledgerEntry.create({
            data: {
              bookingId: booking.id,
              paymentId: booking.payment.id,
              userId: booking.affiliateId,
              type: 'AFFILIATE_COMMISSION_REVERSAL',
              amount: `-${booking.affiliateAmount}`,
              description: `Affiliate commission reversed — booking declined by provider`,
            },
          })
        }

        // Update affiliate click status
        await db.affiliateClick.updateMany({
          where: { bookingId: booking.id, affiliateId: aff.id },
          data: { status: 'CANCELLED' },
        })
      }
    }

    // Notify the patient
    const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'
    await notify({
      userId: booking.patientId,
      type: 'booking_declined',
      title: 'Booking declined',
      body: `${providerName} has declined your booking. A full refund of $${refundAmount} has been processed.`,
      link: 'bookings',
      meta: { bookingId: booking.id, refundAmount },
    })

    // Send email to patient
    const { sendEmail, bookingDeclinedEmail } = await import('@/lib/email')
    const patientUser = await db.user.findUnique({ where: { id: booking.patientId }, select: { name: true, email: true } })
    if (patientUser) {
      const tpl = bookingDeclinedEmail(patientUser.name || 'Patient', providerName, refundAmount)
      await sendEmail({ to: patientUser.email, subject: tpl.subject, html: tpl.html })
    }

    return json({ booking: updated, refundAmount })
  } catch (e) { return handleError(e) }
}
