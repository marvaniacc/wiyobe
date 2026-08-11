import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  id: z.string(),
})

/**
 * PATCH /api/notifications/read
 *
 * Marks a single notification as read by id. The notification must belong
 * to the caller.
 */
export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { id } = await parseBody(req, schema)

    // Verify ownership
    const notif = await db.notification.findUnique({ where: { id } })
    if (!notif || notif.userId !== session.id) return error(404, 'Notification not found')

    await db.notification.update({
      where: { id },
      data: { isRead: true, read: true },
    })

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
