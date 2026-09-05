import { db } from '@/lib/db'

export const PAYMENT_HOLD_MS = 30 * 60 * 1000

/**
 * Releases unpaid booking holds that have outlived their checkout window.
 *
 * A booking without a Payment row expires from its creation time. Once a
 * Checkout Session exists, `payment.updatedAt` is refreshed when that session
 * is created, so its 30-minute Stripe window becomes the authoritative hold.
 * Each booking is transitioned conditionally inside a transaction, ensuring a
 * late Stripe webhook that already confirmed it is never undone.
 */
export async function expirePaymentHolds(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PAYMENT_HOLD_MS)
  const candidates = await db.booking.findMany({
    where: {
      status: 'PENDING',
      OR: [
        { payment: null, createdAt: { lt: cutoff } },
        { payment: { is: { status: 'PENDING', updatedAt: { lt: cutoff } } } },
      ],
    },
    select: { id: true, slotId: true, promoCodeId: true },
    take: 250,
  })

  let expired = 0
  for (const booking of candidates) {
    const released = await db.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({
        where: { id: booking.id, status: 'PENDING' },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'Payment hold expired',
          cancelledAt: now,
          refundAmount: '0',
        },
      })
      if (changed.count === 0) return false
      if (booking.slotId) {
        await tx.slot.update({ where: { id: booking.slotId }, data: { isBooked: false } })
      }
      if (booking.promoCodeId) {
        await tx.promoCode.updateMany({
          where: { id: booking.promoCodeId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        })
      }
      return true
    })
    if (released) expired += 1
  }
  return expired
}
