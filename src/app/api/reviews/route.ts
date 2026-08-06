import { db } from '@/lib/db'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const subjectUserId = searchParams.get('subjectUserId')
    if (!subjectUserId) return error(400, 'subjectUserId required')
    const reviews = await db.review.findMany({
      where: { subjectUserId },
      include: { author: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
    return json({ reviews, avg, count: reviews.length })
  } catch (e) { return handleError(e) }
}
