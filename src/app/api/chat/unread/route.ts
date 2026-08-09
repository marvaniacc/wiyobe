import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/chat/unread
 *
 * Returns unread chat message counts per booking for the current user.
 * Used by the provider dashboard to show unread badges on booking rows.
 *
 * Response: { counts: { [bookingId]: number } }
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    // Count unread messages where the sender is NOT the current user
    // (messages sent TO the current user that they haven't read yet)
    const unread = await db.chatMessage.groupBy({
      by: ['bookingId'],
      where: {
        read: false,
        senderId: { not: session.id },
        booking: {
          OR: [
            { patientId: session.id },
            { doctor: { userId: session.id } },
            { hospital: { userId: session.id } },
            { hotel: { userId: session.id } },
            { translator: { userId: session.id } },
          ],
        },
      },
      _count: { id: true },
    })

    const counts: Record<string, number> = {}
    for (const u of unread) {
      counts[u.bookingId] = u._count.id
    }

    return json({ counts })
  } catch (e) { return handleError(e) }
}
