import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { notify } from '@/lib/notify'
import { checkAndPromoteTier } from '@/lib/affiliate-tiers'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({ bookingId: z.string() })

// Mark a booking as completed — releases the provider's AND affiliate's pending credit into available balance.
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

    // === Release provider's pending balance → available ===
    if (providerUserId) {
      const affiliate = await db.user.findUnique({
        where: { id: providerUserId },
        include: { doctor: true, hospital: true, hotel: true, translator: true },
      })
      // Use the ledger balance system for providers
      // (the getProviderBalance function in ledger.ts already checks booking status COMPLETED)
    }

    // === Release affiliate's pending balance → available ===
    if (booking.affiliateId && booking.affiliateAmount && parseFloat(booking.affiliateAmount) > 0) {
      const aff = await db.affiliate.findUnique({ where: { userId: booking.affiliateId } })
      if (aff) {
        const commissionAmount = parseFloat(booking.affiliateAmount)
        const newPending = Math.max(0, parseFloat(aff.pendingBalance) - commissionAmount).toFixed(2)
        const newAvailable = (parseFloat(aff.availableBalance) + commissionAmount).toFixed(2)

        await db.affiliate.update({
          where: { userId: booking.affiliateId },
          data: {
            pendingBalance: newPending,
            availableBalance: newAvailable,
          },
        })

        // Update the affiliate click status to COMPLETED
        await db.affiliateClick.updateMany({
          where: { bookingId: booking.id, affiliateId: aff.id },
          data: { status: 'COMPLETED' },
        })

        // Notify the affiliate that their commission is now available
        await notify({
          userId: booking.affiliateId,
          type: 'booking_completed',
          title: 'Affiliate commission released',
          body: `A booking you referred has been completed. $${commissionAmount.toFixed(2)} is now available for payout.`,
          link: 'payouts',
          meta: { bookingId: booking.id, amount: commissionAmount.toFixed(2) },
        })

        // Check for tier promotion after earnings update
        await checkAndPromoteTier(aff.id)
      }
    }

    // Notify the patient that their visit is completed
    if (providerUserId && isProvider) {
      await notify({
        userId: booking.patientId,
        type: 'booking_completed',
        title: 'Visit completed',
        body: 'Your visit has been marked as completed. Please leave a review to help other patients.',
        link: 'bookings',
        meta: { bookingId: booking.id },
      })
    }
    // Notify the provider that payout is now available
    if (isPatient && providerUserId) {
      await notify({
        userId: providerUserId,
        type: 'booking_completed',
        title: 'Booking completed',
        body: `Booking completed. $${booking.providerNetAmount} is now available for payout.`,
        link: 'payouts',
        meta: { bookingId: booking.id, amount: booking.providerNetAmount },
      })
    }

    return json({ booking: updated })
  } catch (e) { return handleError(e) }
}
