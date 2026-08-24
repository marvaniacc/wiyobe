import { db } from '@/lib/db'
import { json, handleError } from '@/lib/api'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// Public endpoint — track a referral click when someone visits via ?ref=CODE
// No auth required. Creates an AffiliateClick record and sets a 30-day cookie.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { referralCode } = body as { referralCode?: string }
    if (!referralCode) return json({ tracked: false })

    const affiliate = await db.affiliate.findUnique({
      where: { referralCode },
    })
    if (!affiliate || !affiliate.verified) return json({ tracked: false })

    // Get visitor info
    const headers = new Headers(req.headers)
    const visitorIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || null
    const userAgent = headers.get('user-agent') || null

    // Click-fraud guard: count at most one click per (affiliate, IP) per 24h.
    // Repeat hits still set the attribution cookie but don't inflate stats.
    const recent = visitorIp
      ? await db.affiliateClick.findFirst({
          where: {
            affiliateId: affiliate.id,
            visitorIp,
            clickedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          select: { id: true },
        })
      : null

    if (!recent) {
      await db.affiliateClick.create({
        data: {
          affiliateId: affiliate.id,
          visitorIp,
          userAgent,
          status: 'CLICKED',
        },
      })
      await db.affiliate.update({
        where: { id: affiliate.id },
        data: { totalClicks: { increment: 1 } },
      })
    }

    // Set HTTP-only cookie with 30-day expiry for attribution
    const c = await cookies()
    c.set('ref_code', referralCode, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return json({ tracked: true, referralCode })
  } catch (e) { return handleError(e) }
}
