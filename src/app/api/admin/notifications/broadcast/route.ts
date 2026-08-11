import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import type { NotificationCategory } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['PATIENT', 'DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR', 'AFFILIATE', 'ADMIN', 'ALL'] as const

const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  category: z.enum(['BOOKING', 'KYC', 'CHAT', 'SYSTEM', 'ANNOUNCEMENT', 'PAYOUT', 'REVIEW', 'MEDICAL', 'PROMO']).default('ANNOUNCEMENT'),
  targetRole: z.enum(VALID_ROLES),
})

/**
 * POST /api/admin/notifications/broadcast
 *
 * Admin only. Broadcasts a notification to all users with the specified role
 * (or ALL users if targetRole is 'ALL'). Uses Prisma `createMany` for
 * efficient bulk insertion in a single database hit.
 *
 * Returns the count of recipients.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const body = await parseBody(req, broadcastSchema)
    const { title, message, category, targetRole } = body

    // Query users based on targetRole
    const where = targetRole === 'ALL'
      ? { status: { not: 'SUSPENDED' } }
      : { role: targetRole, status: { not: 'SUSPENDED' } }

    const users = await db.user.findMany({
      where,
      select: { id: true },
    })

    if (users.length === 0) {
      return json({ ok: true, recipientCount: 0, message: 'No matching users found' })
    }

    // Bulk insert notifications for all targeted users in a single DB hit.
    // Uses category 'ANNOUNCEMENT' by default so the UI can style them distinctly.
    const categoryStr = category as NotificationCategory
    const type = categoryStr.toLowerCase()

    await db.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        category: categoryStr,
        title,
        body: message,
        isRead: false,
        read: false,
        metadata: { broadcast: true, targetRole, sentBy: session.id } as any,
        meta: JSON.stringify({ broadcast: true, targetRole, sentBy: session.id }),
      })),
    })

    return json({ ok: true, recipientCount: users.length })
  } catch (e) { return handleError(e) }
}
