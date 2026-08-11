import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications
 *
 * Returns the caller's notifications, newest first.
 * Supports `?unread=true` to filter to only unread items.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get('unread') === 'true'

    const where = unreadOnly
      ? { userId: session.id, isRead: false }
      : { userId: session.id }

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({ where: { userId: session.id, isRead: false } }),
    ])

    return json({ notifications, unreadCount })
  } catch (e) { return handleError(e) }
}

/**
 * POST /api/notifications
 *
 * Legacy: mark ALL notifications as read. (Kept for backward compat with
 * the existing notification-bell UI that calls POST.)
 */
export async function POST() {
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
