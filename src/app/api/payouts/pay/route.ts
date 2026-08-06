import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({ payoutId: z.string(), reference: z.string().optional() })

// Admin marks a payout as completed (sent the bank transfer off-platform).
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, schema)
    const payout = await db.payout.update({
      where: { id: body.payoutId },
      data: { status: 'COMPLETED', completedAt: new Date(), reference: body.reference || null },
    })
    return json({ payout })
  } catch (e) { return handleError(e) }
}
