import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// GET — list all affiliates with their balances + existing payouts
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const affiliates = await db.affiliate.findMany({
      where: { verified: true, availableBalance: { not: '0' } },
      include: { user: { select: { name: true, email: true } } },
    })

    const balances = affiliates
      .filter(a => parseFloat(a.availableBalance) > 0)
      .map(a => ({
        id: a.id,
        userId: a.userId,
        name: a.user.name || a.user.email,
        email: a.user.email,
        tier: a.tier,
        availableBalance: a.availableBalance,
        pendingBalance: a.pendingBalance,
        paidOut: a.paidOut,
        totalEarnings: a.totalEarnings,
      }))

    const payouts = await db.affiliatePayout.findMany({
      include: { affiliate: { include: { user: { select: { name: true, email: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return json({ balances, payouts })
  } catch (e) { return handleError(e) }
}

const runSchema = z.object({})

// POST — run a settlement batch: create PAYOUT records for all affiliates with available balance
export async function POST() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const affiliates = await db.affiliate.findMany({
      where: { verified: true },
    })

    const now = new Date()
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // last 30 days
    const created: any[] = []

    for (const aff of affiliates) {
      const available = parseFloat(aff.availableBalance)
      if (available < 0.01) continue

      // Create payout record
      const payout = await db.affiliatePayout.create({
        data: {
          affiliateId: aff.id,
          amount: available.toFixed(2),
          currency: 'USD',
          status: 'PENDING',
          method: 'bank_transfer',
          periodStart,
          periodEnd: now,
        },
      })

      // Deduct from available balance, add to paidOut
      await db.affiliate.update({
        where: { id: aff.id },
        data: {
          availableBalance: '0',
          paidOut: (parseFloat(aff.paidOut) + available).toFixed(2),
        },
      })

      created.push({
        payoutId: payout.id,
        affiliate: aff.userId,
        amount: available.toFixed(2),
      })
    }

    return json({ created, count: created.length })
  } catch (e) { return handleError(e) }
}
