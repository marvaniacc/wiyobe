import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// List all affiliates
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const affiliates = await db.affiliate.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, status: true, createdAt: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return json({
      affiliates: affiliates.map(a => ({
        id: a.id,
        referralCode: a.referralCode,
        verified: a.verified,
        totalClicks: a.totalClicks,
        totalSignups: a.totalSignups,
        totalBookings: a.totalBookings,
        totalEarnings: a.totalEarnings,
        availableBalance: a.availableBalance,
        pendingBalance: a.pendingBalance,
        paidOut: a.paidOut,
        website: a.website,
        socialMedia: a.socialMedia,
        createdAt: a.createdAt,
        user: a.user,
      })),
    })
  } catch (e) { return handleError(e) }
}

const actionSchema = z.object({
  affiliateId: z.string(),
  action: z.enum(['approve', 'suspend', 'activate']),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, actionSchema)

    const affiliate = await db.affiliate.findUnique({
      where: { id: body.affiliateId },
      include: { user: true },
    })
    if (!affiliate) return error(404, 'Affiliate not found')

    if (body.action === 'approve') {
      await db.affiliate.update({ where: { id: affiliate.id }, data: { verified: true } })
      await db.user.update({ where: { id: affiliate.userId }, data: { status: 'ACTIVE' } })
    } else if (body.action === 'suspend') {
      await db.affiliate.update({ where: { id: affiliate.id }, data: { verified: false } })
      await db.user.update({ where: { id: affiliate.userId }, data: { status: 'SUSPENDED' } })
    } else if (body.action === 'activate') {
      await db.affiliate.update({ where: { id: affiliate.id }, data: { verified: true } })
      await db.user.update({ where: { id: affiliate.userId }, data: { status: 'ACTIVE' } })
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
