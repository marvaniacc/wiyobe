import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Get all clicks/referrals for the affiliate with pagination
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'AFFILIATE') return error(403, 'Affiliates only')

    const affiliate = await db.affiliate.findUnique({ where: { userId: session.id } })
    if (!affiliate) return error(404, 'Affiliate profile not found')

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') // filter by status

    const where: any = { affiliateId: affiliate.id }
    if (status) where.status = status

    const clicks = await db.affiliateClick.findMany({
      where,
      include: {
        referredUser: { select: { name: true, email: true, role: true, createdAt: true } },
      },
      orderBy: { clickedAt: 'desc' },
      take: 100,
    })

    const result = clicks.map(c => ({
      id: c.id,
      status: c.status,
      clickedAt: c.clickedAt,
      convertedAt: c.convertedAt,
      commissionAmount: c.commissionAmount,
      referredUserName: c.referredUser?.name || null,
      referredUserRole: c.referredUser?.role || null,
      referredUserCreatedAt: c.referredUser?.createdAt || null,
    }))

    return json({ clicks: result })
  } catch (e) { return handleError(e) }
}
