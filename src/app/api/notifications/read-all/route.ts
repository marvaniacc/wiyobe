import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/notifications/read-all
 *
 * Marks ALL of the caller's unread notifications as read.
 */
export async function PATCH() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    await db.notification.updateMany({
      where: { userId: session.id, isRead: false },
      data: { isRead: true, read: true },
    })

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
