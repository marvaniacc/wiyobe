import { db } from '@/lib/db'
import { subDec, toCentsInt, fromCentsInt } from '@/lib/money'
import type { ProviderType } from '@prisma/client'

// Get commission rates (platform + affiliate) for a provider type.
// affiliateRate = % of the PLATFORM commission that the affiliate earns
// (matches the CommissionRate model default of 25).
export async function getCommissionRate(pt: ProviderType): Promise<{ platformRate: string; affiliateRate: string }> {
  const cr = await db.commissionRate.findUnique({ where: { providerType: pt } })
  return {
    platformRate: cr?.rate ?? '12',
    affiliateRate: cr?.affiliateRate ?? '25',
  }
}

export async function getCancellationPolicy(pt: ProviderType) {
  const p = await db.cancellationPolicy.findUnique({ where: { providerType: pt } })
  return p ?? { freeCancellationHours: 24, cancellationFeePercent: '20' }
}

// Provider's userId for a given booking's provider fields
export async function resolveProviderUser(
  booking: { providerType: ProviderType; doctorId: string | null; hospitalId: string | null; hotelId: string | null; translatorId: string | null }
): Promise<string | null> {
  if (booking.providerType === 'DOCTOR' && booking.doctorId) {
    const d = await db.doctor.findUnique({ where: { id: booking.doctorId }, select: { userId: true } })
    return d?.userId ?? null
  }
  if (booking.providerType === 'HOSPITAL' && booking.hospitalId) {
    const h = await db.hospital.findUnique({ where: { id: booking.hospitalId }, select: { userId: true } })
    return h?.userId ?? null
  }
  if (booking.providerType === 'HOTEL' && booking.hotelId) {
    const h = await db.hotel.findUnique({ where: { id: booking.hotelId }, select: { userId: true } })
    return h?.userId ?? null
  }
  if (booking.providerType === 'TRANSLATOR' && booking.translatorId) {
    const t = await db.translator.findUnique({ where: { id: booking.translatorId }, select: { userId: true } })
    return t?.userId ?? null
  }
  return null
}

// Create the standard set of ledger entries when a patient pays for a booking.
// - PATIENT_CHARGE (+platform cash, not tied to provider balance)
// - COMMISSION (platform revenue)
// - PROVIDER_CREDIT (credit to provider's pending balance)
export async function recordPaymentLedger(opts: {
  bookingId: string
  paymentId: string
  amount: string
  commissionRate: string
  providerUserId: string
  description?: string
}) {
  const { bookingId, paymentId, amount, commissionRate, providerUserId } = opts
  // commission = amount * rate%  (integer cents math)
  const commissionAmount = fromCentsInt(Math.round((toCentsInt(amount) * parseFloat(commissionRate)) / 100))
  const providerNet = subDec(amount, commissionAmount)

  await db.ledgerEntry.createMany({
    data: [
      {
        type: 'PATIENT_CHARGE',
        bookingId,
        paymentId,
        amount,
        description: opts.description ?? 'Patient payment received',
      },
      {
        type: 'COMMISSION',
        bookingId,
        paymentId,
        amount: commissionAmount,
        description: `Platform commission (${commissionRate}%)`,
      },
      {
        type: 'PROVIDER_CREDIT',
        bookingId,
        paymentId,
        userId: providerUserId,
        amount: providerNet,
        description: 'Provider credit (pending until service completion)',
      },
    ],
  })
  return { commissionAmount, providerNet }
}

// Refund ledger: reverse patient charge, reverse commission, debit provider
export async function recordRefundLedger(opts: {
  bookingId: string
  paymentId: string
  refundAmount: string
  commissionRate: string
  providerUserId: string
  originalAmount: string
  description?: string
}) {
  const { bookingId, paymentId, refundAmount, commissionRate, providerUserId, originalAmount } = opts
  // proportional commission reversal (integer cents math)
  const commissionReversal = fromCentsInt(Math.round((toCentsInt(refundAmount) * parseFloat(commissionRate)) / 100))
  const providerDebit = subDec(refundAmount, commissionReversal)
  const ratioPct = toCentsInt(originalAmount) > 0
    ? Math.round((toCentsInt(refundAmount) / toCentsInt(originalAmount)) * 100)
    : 100

  await db.ledgerEntry.createMany({
    data: [
      {
        type: 'REFUND_PATIENT',
        bookingId,
        paymentId,
        amount: fromCentsInt(-toCentsInt(refundAmount)),
        description: `Refund to patient (${ratioPct}% of ${originalAmount})`,
      },
      {
        type: 'REFUND_COMMISSION_REVERSAL',
        bookingId,
        paymentId,
        amount: fromCentsInt(-toCentsInt(commissionReversal)),
        description: `Commission reversal on refund`,
      },
      {
        type: 'REFUND_PROVIDER_DEBIT',
        bookingId,
        paymentId,
        userId: providerUserId,
        amount: fromCentsInt(-toCentsInt(providerDebit)),
        description: `Provider debit on refund`,
      },
    ],
  })
  return { commissionReversal, providerDebit }
}

// Provider balance: sum of PROVIDER_CREDIT + REFUND_PROVIDER_DEBIT + PAYOUT (all signed)
// "Available" = entries for COMPLETED bookings only (released).
// For MVP: available = sum of provider credits where booking.status = COMPLETED, minus payouts, minus refund debits.
export async function getProviderBalance(providerUserId: string) {
  const entries = await db.ledgerEntry.findMany({
    where: { userId: providerUserId },
    include: { booking: { select: { status: true } } },
  })
  let available = 0 // released (completed) credits - payouts - refund debits
  let pending = 0 // credits for non-completed active bookings
  let lifetime = 0
  let paidOut = 0
  for (const e of entries) {
    const amt = toCentsInt(e.amount)
    lifetime += amt
    if (e.type === 'PAYOUT') {
      paidOut += Math.abs(amt)
      available -= Math.abs(amt)
      continue
    }
    if (e.type === 'PROVIDER_CREDIT') {
      if (e.booking?.status === 'COMPLETED') {
        available += amt
      } else if (e.booking?.status === 'CANCELLED' || e.booking?.status === 'REFUNDED') {
        // skip — credit is reversed by the refund debit, so neither is counted
      } else {
        pending += amt
      }
    } else if (e.type === 'REFUND_PROVIDER_DEBIT') {
      // For cancelled bookings, both PROVIDER_CREDIT and REFUND_PROVIDER_DEBIT
      // are skipped. The net effect of a cancelled booking on available is zero.
      // This prevents the double-counting bug where the credit was skipped but
      // the debit was still subtracted from available.
      if (e.booking?.status === 'CANCELLED' || e.booking?.status === 'REFUNDED') {
        // skip — paired with the skipped PROVIDER_CREDIT above
      } else {
        available += amt // negative, reduces available (for partial refunds on active bookings)
      }
    }
  }
  return {
    available: fromCentsInt(available),
    pending: fromCentsInt(pending),
    lifetime: fromCentsInt(available + pending + paidOut),
    paidOut: fromCentsInt(paidOut),
  }
}
