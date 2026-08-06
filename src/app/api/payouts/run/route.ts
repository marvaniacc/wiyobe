import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { getProviderBalance } from '@/lib/ledger'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Admin runs a settlement batch: for every provider with available balance, create a PAYOUT record + ledger entry.
export async function POST() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const providers = await db.user.findMany({
      where: { role: { in: ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] }, status: 'ACTIVE' },
      include: { doctor: true, hospital: true, hotel: true, translator: true },
    })
    const now = new Date()
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const created: any[] = []
    for (const p of providers) {
      const bal = await getProviderBalance(p.id)
      const available = parseFloat(bal.available)
      if (available <= 0.01) continue
      const pt = (p.doctor ? 'DOCTOR' : p.hospital ? 'HOSPITAL' : p.hotel ? 'HOTEL' : 'TRANSLATOR') as ProviderType
      const payout = await db.payout.create({
        data: {
          providerUserId: p.id,
          providerType: pt,
          amount: available.toFixed(2),
          currency: 'USD',
          status: 'PENDING',
          method: 'bank_transfer',
          periodStart,
          periodEnd: now,
        },
      })
      await db.ledgerEntry.create({
        data: {
          type: 'PAYOUT',
          payoutId: payout.id,
          userId: p.id,
          amount: (-available).toFixed(2),
          description: `Settlement payout ${payout.id.slice(-6)}`,
        },
      })
      created.push({ payoutId: payout.id, provider: p.name, amount: available.toFixed(2) })
    }
    return json({ created, count: created.length })
  } catch (e) { return handleError(e) }
}
