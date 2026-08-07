import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import type { AffiliateTier } from '@prisma/client'
import { checkAndPromoteTier } from '@/lib/affiliate-tiers'

export const dynamic = 'force-dynamic'

const TIER_DEFAULTS: Record<string, { minReferrals: number; minEarnings: string; bonusRate: string }> = {
  BRONZE:   { minReferrals: 0,  minEarnings: '0',    bonusRate: '0' },
  SILVER:   { minReferrals: 5,  minEarnings: '100',  bonusRate: '1' },
  GOLD:     { minReferrals: 20, minEarnings: '500',  bonusRate: '2' },
  PLATINUM: { minReferrals: 50, minEarnings: '2000', bonusRate: '3' },
}

// List all affiliates + tier settings
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

    // Get tier settings — ensure all 4 tiers exist with defaults
    let settings = await db.affiliateSetting.findMany()
    const tiers: AffiliateTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
    for (const tier of tiers) {
      if (!settings.find(s => s.tier === tier)) {
        const d = TIER_DEFAULTS[tier]
        const s = await db.affiliateSetting.create({ data: { tier, minReferrals: d.minReferrals, minEarnings: d.minEarnings, bonusRate: d.bonusRate } })
        settings.push(s)
      }
    }

    return json({
      affiliates: affiliates.map(a => ({
        id: a.id,
        referralCode: a.referralCode,
        tier: a.tier,
        tierBonusRate: a.tierBonusRate,
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
      tierSettings: settings.sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier)),
    })
  } catch (e) { return handleError(e) }
}

const actionSchema = z.object({
  affiliateId: z.string(),
  action: z.enum(['approve', 'suspend', 'activate', 'setTier', 'recalculateTier']),
  tier: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']).optional(),
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
      // Manual tier override — get the bonus rate from settings for that tier
      const setting = await db.affiliateSetting.findUnique({ where: { tier: body.tier } })
      const bonusRate = setting?.bonusRate || TIER_DEFAULTS[body.tier].bonusRate
      await db.affiliate.update({
        where: { id: affiliate.id },
        data: { tier: body.tier, tierBonusRate: bonusRate },
      })
    } else if (body.action === 'recalculateTier') {
      // Auto-recalculate tier based on current stats
      const newTier = await checkAndPromoteTier(affiliate.id)
      return json({ ok: true, newTier })
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}

// Update tier threshold settings
const settingsSchema = z.object({
  tierSettings: z.array(z.object({
    tier: z.enum(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']),
    minReferrals: z.number().int().min(0),
    minEarnings: z.string(),
    bonusRate: z.string(),
  })),
})

export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, settingsSchema)

    for (const s of body.tierSettings) {
      await db.affiliateSetting.upsert({
        where: { tier: s.tier },
        update: { minReferrals: s.minReferrals, minEarnings: s.minEarnings, bonusRate: s.bonusRate },
        create: { tier: s.tier, minReferrals: s.minReferrals, minEarnings: s.minEarnings, bonusRate: s.bonusRate },
      })
    }

    // After settings change, re-evaluate all affiliates' tiers
    const allAffiliates = await db.affiliate.findMany()
    for (const a of allAffiliates) {
      await checkAndPromoteTier(a.id)
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
