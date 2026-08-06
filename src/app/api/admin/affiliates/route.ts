import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import type { AffiliateTier } from '@prisma/client'

export const dynamic = 'force-dynamic'

// List all affiliates + their settings
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

    // Get tier settings
    let settings = await db.affiliateSetting.findMany()
    const tiers: AffiliateTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
    // Ensure all tiers exist
    for (const tier of tiers) {
      if (!settings.find(s => s.tier === tier)) {
        const defaults: Record<string, string> = { BRONZE: '5', SILVER: '10', GOLD: '15', PLATINUM: '20' }
        const s = await db.affiliateSetting.create({ data: { tier, commissionRate: defaults[tier] } })
        settings.push(s)
      }
    }

    return json({
      affiliates: affiliates.map(a => ({
        id: a.id,
        referralCode: a.referralCode,
        tier: a.tier,
        commissionRate: a.commissionRate,
        verified: a.verified,
        totalClicks: a.totalClicks,
        totalSignups: a.totalSignups,
        totalBookings: a.totalBookings,
        totalEarnings: a.totalEarnings,
        availableBalance: a.availableBalance,
        paidOut: a.paidOut,
        website: a.website,
        socialMedia: a.socialMedia,
        createdAt: a.createdAt,
        user: a.user,
      })),
      settings: settings.sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier)),
    })
  } catch (e) { return handleError(e) }
}

const actionSchema = z.object({
  affiliateId: z.string(),
  action: z.enum(['approve', 'suspend', 'activate', 'setTier', 'setRate']),
  tier: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']).optional(),
  commissionRate: z.string().optional(),
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
    } else if (body.action === 'setTier' && body.tier) {
      // When tier changes, update commission rate from settings
      const setting = await db.affiliateSetting.findUnique({ where: { tier: body.tier } })
      const rate = setting?.commissionRate || affiliate.commissionRate
      await db.affiliate.update({
        where: { id: affiliate.id },
        data: { tier: body.tier, commissionRate: rate },
      })
    } else if (body.action === 'setRate' && body.commissionRate) {
      await db.affiliate.update({
        where: { id: affiliate.id },
        data: { commissionRate: body.commissionRate },
      })
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}

// Update tier commission settings
const settingsSchema = z.object({
  settings: z.array(z.object({
    tier: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']),
    commissionRate: z.string(),
  })),
})

export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, settingsSchema)

    for (const s of body.settings) {
      await db.affiliateSetting.upsert({
        where: { tier: s.tier },
        update: { commissionRate: s.commissionRate },
        create: { tier: s.tier, commissionRate: s.commissionRate },
      })
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
