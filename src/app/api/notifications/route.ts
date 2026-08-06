import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const notifications = await db.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unreadCount = await db.notification.count({ where: { userId: session.id, read: false } })
    return json({ notifications, unreadCount })
  } catch (e) { return handleError(e) }
}

// Mark all as read
export async function POST() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    await db.notification.updateMany({
      where: { userId: session.id, read: false },
      data: { read: true },
    })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
