import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { notify } from '@/lib/notify'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  reviewId: z.string(),
  reply: z.string().min(2).max(1000),
})

// Provider replies to a review
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, schema)

    const review = await db.review.findUnique({
      where: { id: body.reviewId },
      include: { booking: true },
    })
    if (!review) return error(404, 'Review not found')

    // Only the provider who received the review can reply
    if (review.subjectUserId !== session.id) {
      return error(403, 'Only the reviewed provider can reply')
    }

    const updated = await db.review.update({
      where: { id: review.id },
      data: { reply: body.reply, repliedAt: new Date() },
    })

    // Notify the patient that the provider replied
    await notify({
      userId: review.authorId,
      type: 'review_received',
      title: 'Provider replied to your review',
      body: `${session.name || 'Provider'} responded to your review.`,
      link: 'reviews',
      meta: { reviewId: review.id },
    })

    return json({ review: updated })
  } catch (e) { return handleError(e) }
}
