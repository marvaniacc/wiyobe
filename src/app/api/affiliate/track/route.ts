import { db } from '@/lib/db'
import { json, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Public endpoint — track a referral click when someone visits via ?ref=CODE
// No auth required. Creates an AffiliateClick record.
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

    // Create click record
    await db.affiliateClick.create({
      data: {
        affiliateId: affiliate.id,
        visitorIp,
        userAgent,
        status: 'CLICKED',
      },
    })

    // Increment total clicks
    await db.affiliate.update({
      where: { id: affiliate.id },
      data: { totalClicks: { increment: 1 } },
    })

    return json({ tracked: true, referralCode })
  } catch (e) { return handleError(e) }
}
