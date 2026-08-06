import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { getProviderBalance } from '@/lib/ledger'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)

    if (session.role === 'ADMIN') {
      // list all payouts + provider balances
      const providers = await db.user.findMany({
        where: { role: { in: ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] }, status: 'ACTIVE' },
        include: { doctor: true, hospital: true, hotel: true, translator: true },
      })
      const rows = []
      for (const p of providers) {
        const bal = await getProviderBalance(p.id)
        const pt = p.doctor ? 'DOCTOR' : p.hospital ? 'HOSPITAL' : p.hotel ? 'HOTEL' : 'TRANSLATOR' as ProviderType
        rows.push({
          userId: p.id,
          name: p.name,
          email: p.email,
          providerType: pt,
          available: bal.available,
          pending: bal.pending,
          paidOut: bal.paidOut,
          lifetime: bal.lifetime,
        })
      }
      const payouts = await db.payout.findMany({
        include: { providerUser: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return json({ providers: rows, payouts })
    }

    // provider: own balance + payout history
    const bal = await getProviderBalance(session.id)
    const payouts = await db.payout.findMany({
      where: { providerUserId: session.id },
      orderBy: { createdAt: 'desc' },
    })
    return json({ balance: bal, payouts })
  } catch (e) { return handleError(e) }
}
