import { db } from '@/lib/db'
import type { AffiliateTier } from '@prisma/client'

// Tier order (lowest to highest)
export const TIER_ORDER: AffiliateTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']

// Default tier configuration (used if no settings in DB)
export const DEFAULT_TIER_CONFIG: Record<AffiliateTier, { minReferrals: number; minEarnings: string; bonusRate: string }> = {
  BRONZE:   { minReferrals: 0,  minEarnings: '0',    bonusRate: '0' },
  SILVER:   { minReferrals: 5,  minEarnings: '100',  bonusRate: '1' },
  GOLD:     { minReferrals: 20, minEarnings: '500',  bonusRate: '2' },
  PLATINUM: { minReferrals: 50, minEarnings: '2000', bonusRate: '3' },
}

// Get tier settings from DB (with defaults fallback)
export async function getTierSettings() {
  let settings = await db.affiliateSetting.findMany()
  const result: Record<AffiliateTier, { minReferrals: number; minEarnings: string; bonusRate: string }> = { ...DEFAULT_TIER_CONFIG }
  for (const tier of TIER_ORDER) {
    const s = settings.find(x => x.tier === tier)
    if (s) {
      result[tier] = {
        minReferrals: s.minReferrals,
        minEarnings: s.minEarnings,
        bonusRate: s.bonusRate,
      }
    }
  }
  return result
}

// Determine which tier an affiliate qualifies for based on their stats
export function calculateTier(
  totalSignups: number,
  totalEarnings: string,
  config: Record<AffiliateTier, { minReferrals: number; minEarnings: string; bonusRate: string }>
): AffiliateTier {
  const earnings = parseFloat(totalEarnings) || 0
  let qualifiedTier: AffiliateTier = 'BRONZE'

  for (const tier of TIER_ORDER) {
    const cfg = config[tier]
    // Qualify if they meet EITHER the referral threshold OR the earnings threshold
    if (totalSignups >= cfg.minReferrals || earnings >= parseFloat(cfg.minEarnings)) {
      qualifiedTier = tier
    }
  }

  return qualifiedTier
}

// Check and auto-promote an affiliate's tier based on their current stats
// Returns the new tier (or null if no change). Sends a notification on promotion.
export async function checkAndPromoteTier(affiliateId: string): Promise<AffiliateTier | null> {
  const affiliate = await db.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) return null

  const config = await getTierSettings()
  const newTier = calculateTier(affiliate.totalSignups, affiliate.totalEarnings, config)

  if (newTier !== affiliate.tier) {
    const newConfig = config[newTier]
    await db.affiliate.update({
      where: { id: affiliateId },
      data: {
        tier: newTier,
        tierBonusRate: newConfig.bonusRate,
      },
    })

    // Send notification to the affiliate about their promotion
    const tierName = newTier.charAt(0) + newTier.slice(1).toLowerCase()
    const oldTierName = affiliate.tier.charAt(0) + affiliate.tier.slice(1).toLowerCase()
    await db.notification.create({
      data: {
        userId: affiliate.userId,
        type: 'system',
        title: `Tier promoted: ${tierName}! 🎉`,
        body: `Congratulations! You've been promoted from ${oldTierName} to ${tierName} tier. Your affiliate bonus rate is now +${newConfig.bonusRate}%.`,
        link: 'overview',
        meta: { oldTier: affiliate.tier, newTier, bonusRate: newConfig.bonusRate },
      },
    })

    return newTier
  }

  return null
}

// Get the effective affiliate rate for a booking
// = base affiliate rate (from CommissionRate) + tier bonus rate
export function getEffectiveAffiliateRate(baseRate: string, tierBonusRate: string): string {
  return (parseFloat(baseRate) + parseFloat(tierBonusRate)).toString()
}

// Get tier progress info for display
export function getTierProgress(
  currentTier: AffiliateTier,
  totalSignups: number,
  totalEarnings: string,
  config: Record<AffiliateTier, { minReferrals: number; minEarnings: string; bonusRate: string }>
): {
  currentTier: AffiliateTier
  nextTier: AffiliateTier | null
  referralsToNext: number
  earningsToNext: string
  progressPct: number
} {
  const earnings = parseFloat(totalEarnings) || 0
  const currentIdx = TIER_ORDER.indexOf(currentTier)
  const nextTier = currentIdx < TIER_ORDER.length - 1 ? TIER_ORDER[currentIdx + 1] : null

  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      referralsToNext: 0,
      earningsToNext: '0',
      progressPct: 100,
    }
  }

  const nextCfg = config[nextTier]
  const currentCfg = config[currentTier]
  const referralsToNext = Math.max(0, nextCfg.minReferrals - totalSignups)
  const earningsToNext = Math.max(0, parseFloat(nextCfg.minEarnings) - earnings).toFixed(2)

  // Progress percentage based on referrals (primary metric)
  const referralProgress = currentCfg.minReferrals === nextCfg.minReferrals
    ? 100
    : Math.min(100, Math.round(((totalSignups - currentCfg.minReferrals) / (nextCfg.minReferrals - currentCfg.minReferrals)) * 100))

  return {
    currentTier,
    nextTier,
    referralsToNext,
    earningsToNext,
    progressPct: referralProgress,
  }
}
