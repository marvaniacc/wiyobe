import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // filter by ledger type
    const userId = searchParams.get('userId')

    let where: any = {}
    if (session.role === 'ADMIN') {
      if (userId) where.userId = userId
      if (type) where.type = type
    } else {
      where.userId = session.id
      if (type) where.type = type
    }
    const entries = await db.ledgerEntry.findMany({
      where,
      include: {
        booking: { select: { id: true, patient: { select: { name: true } } } },
        payment: { select: { id: true } },
        payout: { select: { id: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return json({ entries })
  } catch (e) { return handleError(e) }
}
