import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({ payoutId: z.string(), reference: z.string().optional() })

// Mark an affiliate payout as completed (admin sent the money off-platform)
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, schema)

    const payout = await db.affiliatePayout.update({
      where: { id: body.payoutId },
      data: { status: 'COMPLETED', completedAt: new Date(), reference: body.reference || null },
    })

    // Notify the affiliate
    const aff = await db.affiliate.findUnique({
      where: { id: payout.affiliateId },
      include: { user: { select: { name: true } } },
    })
    if (aff) {
      await (await import('@/lib/notify')).notify({
        userId: aff.userId,
        type: 'payout_sent',
        title: 'Affiliate payout sent',
        body: `Your payout of $${payout.amount} has been processed.`,
        link: 'payouts',
        meta: { payoutId: payout.id, amount: payout.amount },
      })
    }

    return json({ payout })
  } catch (e) { return handleError(e) }
}
