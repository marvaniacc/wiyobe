import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Get affiliate payouts
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'AFFILIATE') return error(403, 'Affiliates only')

    const affiliate = await db.affiliate.findUnique({ where: { userId: session.id } })
    if (!affiliate) return error(404, 'Affiliate profile not found')

    const payouts = await db.affiliatePayout.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' },
    })

    return json({ payouts, balance: { available: affiliate.availableBalance, pending: affiliate.pendingBalance, paidOut: affiliate.paidOut, totalEarnings: affiliate.totalEarnings } })
  } catch (e) { return handleError(e) }
}
