import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Affiliate stats — overview numbers, recent clicks, conversion funnel
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'AFFILIATE') return error(403, 'Affiliates only')

    const affiliate = await db.affiliate.findUnique({
      where: { userId: session.id },
      include: {
        clicks: {
          orderBy: { clickedAt: 'desc' },
          take: 20,
          include: {
            referredUser: { select: { name: true, email: true, role: true, createdAt: true } },
          },
        },
        payouts: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })

    if (!affiliate) return error(404, 'Affiliate profile not found')

    // Conversion funnel
    const totalClicks = affiliate.clicks.length
    const signups = affiliate.clicks.filter(c => c.status === 'SIGNED_UP' || c.status === 'BOOKED' || c.status === 'COMPLETED').length
    const bookings = affiliate.clicks.filter(c => c.status === 'BOOKED' || c.status === 'COMPLETED').length
    const completed = affiliate.clicks.filter(c => c.status === 'COMPLETED').length

    const conversionRate = totalClicks > 0 ? Math.round((signups / totalClicks) * 1000) / 10 : 0
    const bookingRate = signups > 0 ? Math.round((bookings / signups) * 1000) / 10 : 0

    // Recent clicks with referred user info (sanitized)
    const recentClicks = affiliate.clicks.map(c => ({
      id: c.id,
      status: c.status,
      clickedAt: c.clickedAt,
      convertedAt: c.convertedAt,
      commissionAmount: c.commissionAmount,
      referredUserName: c.referredUser?.name || null,
      referredUserRole: c.referredUser?.role || null,
    }))

    return json({
      stats: {
        totalClicks: affiliate.totalClicks,
        totalSignups: affiliate.totalSignups,
        totalBookings: affiliate.totalBookings,
        totalEarnings: affiliate.totalEarnings,
        availableBalance: affiliate.availableBalance,
        pendingBalance: affiliate.pendingBalance,
        paidOut: affiliate.paidOut,
        tier: affiliate.tier,
        tierBonusRate: affiliate.tierBonusRate,
        conversionRate,
        bookingRate,
        verified: affiliate.verified,
        referralCode: affiliate.referralCode,
      },
      funnel: { clicks: totalClicks, signups, bookings, completed },
      recentClicks,
      payouts: affiliate.payouts,
    })
  } catch (e) { return handleError(e) }
}
