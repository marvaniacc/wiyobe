import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { getCancellationPolicy, resolveProviderUser, recordRefundLedger } from '@/lib/ledger'
import { notify } from '@/lib/notify'
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
      include: {
        payment: true,
        doctor: { include: { user: { select: { name: true } } } },
        hospital: { select: { name: true } },
        hotel: { select: { name: true } },
        translator: { include: { user: { select: { name: true } } } },
      },
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

    // Process refund through Stripe if configured
    if (booking.payment?.stripeChargeId && !booking.payment.stripeChargeId.startsWith('ch_mock_')) {
      const { refundPayment } = await import('@/lib/stripe')
      const refund = await refundPayment(
        booking.payment.stripeChargeId,
        parseFloat(refundAmount)
      )
      if (refund) {
        console.log(`Refund processed: ${refund.id} for $${refund.amount}`)
      }
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

    // === Affiliate commission reversal ===
    if (booking.affiliateId && booking.affiliateAmount && parseFloat(booking.affiliateAmount) > 0) {
      const aff = await db.affiliate.findUnique({ where: { userId: booking.affiliateId } })
      if (aff) {
        const commissionAmount = parseFloat(booking.affiliateAmount)

        // Determine whether to reverse from pendingBalance or availableBalance
        // If booking was COMPLETED, the commission was already moved to availableBalance
        // Otherwise it's still in pendingBalance
        if (booking.status === 'COMPLETED') {
          const newAvailable = Math.max(0, parseFloat(aff.availableBalance) - commissionAmount).toFixed(2)
          await db.affiliate.update({
            where: { userId: booking.affiliateId },
            data: { availableBalance: newAvailable },
          })
        } else {
          const newPending = Math.max(0, parseFloat(aff.pendingBalance) - commissionAmount).toFixed(2)
          await db.affiliate.update({
            where: { userId: booking.affiliateId },
            data: { pendingBalance: newPending },
          })
        }

        // Decrement totalEarnings
        const newTotalEarnings = Math.max(0, parseFloat(aff.totalEarnings) - commissionAmount).toFixed(2)
        await db.affiliate.update({
          where: { userId: booking.affiliateId },
          data: { totalEarnings: newTotalEarnings },
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
              description: `Affiliate commission reversed — booking cancelled`,
            },
          })
        }

        // Update affiliate click status to CANCELLED
        await db.affiliateClick.updateMany({
          where: { bookingId: booking.id, affiliateId: aff.id },
          data: { status: 'CANCELLED' },
        })
      }
    }

    // Notifications — notify both parties about cancellation
    const otherUserId = isPatient ? providerUserId : booking.patientId
    const cancelledBy = isPatient ? 'Patient' : isProvider ? 'Provider' : 'Admin'
    if (otherUserId) {
      await notify({
        userId: otherUserId,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        body: `A booking has been cancelled by ${cancelledBy}. Refund: $${refundAmount}.`,
        link: isPatient ? 'appointments' : 'bookings',
        meta: { bookingId: booking.id, refundAmount },
      })
    }

    // Send cancellation emails
    const { sendEmail, bookingCancelledEmail } = await import('@/lib/email')
    const providerName = booking.doctor?.user?.name || booking.hospital?.name || booking.hotel?.name || booking.translator?.user?.name || 'Provider'
    const patientUser = await db.user.findUnique({ where: { id: booking.patientId }, select: { name: true, email: true } })
    const providerUser = providerUserId ? await db.user.findUnique({ where: { id: providerUserId }, select: { name: true, email: true } }) : null

    if (patientUser) {
      const tpl = bookingCancelledEmail(patientUser.name || 'Patient', providerName, refundAmount)
      await sendEmail({ to: patientUser.email, subject: tpl.subject, html: tpl.html })
    }
    if (providerUser) {
      const tpl = bookingCancelledEmail(providerUser.name || 'Provider', patientUser?.name || 'Patient', refundAmount)
      await sendEmail({ to: providerUser.email, subject: tpl.subject, html: tpl.html })
    }

    return json({ booking: updated, refundAmount, feeRetained, withinFreeWindow })
  } catch (e) { return handleError(e) }
}
