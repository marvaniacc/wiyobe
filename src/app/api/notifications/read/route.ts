import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({ id: z.string() })

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { id } = await parseBody(req, schema)
    await db.notification.update({
      where: { id, userId: session.id },
      data: { read: true },
    })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
