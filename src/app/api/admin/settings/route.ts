import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/settings
 *
 * Returns all platform settings. Admin-only.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const settings = await db.setting.findMany({ orderBy: { key: 'asc' } })
    const map: Record<string, string> = {}
    for (const s of settings) map[s.key] = s.value
    return json({ settings: map })
  } catch (e) { return handleError(e) }
}

const updateSchema = z.object({
  settings: z.record(z.string(), z.string()),
})

/**
 * PUT /api/admin/settings
 *
 * Bulk-upsert platform settings. Admin-only.
 */
export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { settings } = await parseBody(req, updateSchema)

    for (const [key, value] of Object.entries(settings)) {
      await db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
