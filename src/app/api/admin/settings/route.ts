import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/settings
 *
 * Returns all platform settings (both Setting and SiteSetting models)
 * merged into a single key-value object. Admin-only.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const [settings, siteSettings] = await Promise.all([
      db.setting.findMany({ orderBy: { key: 'asc' } }),
      db.siteSetting.findMany({ orderBy: { key: 'asc' } }),
    ])

    const map: Record<string, string> = {}
    for (const s of settings) map[s.key] = s.value
    for (const s of siteSettings) if (s.value != null) map[s.key] = s.value

    return json({ settings: map })
  } catch (e) { return handleError(e) }
}

const updateSchema = z.object({
  settings: z.record(z.string(), z.string()),
})

/**
 * PUT /api/admin/settings
 *
 * Bulk-upsert settings. Routes each key to the appropriate model:
 * - SiteSetting keys (siteName, tagline, logoUrl, defaultSeoTitle,
 *   defaultSeoDescription) go to the SiteSetting table.
 * - All other keys go to the Setting table (legacy).
 */
export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { settings } = await parseBody(req, updateSchema)

    const SITE_SETTING_KEYS = new Set([
      'siteName', 'tagline', 'logoUrl', 'defaultSeoTitle', 'defaultSeoDescription',
    ])

    for (const [key, value] of Object.entries(settings)) {
      if (SITE_SETTING_KEYS.has(key)) {
        await db.siteSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      } else {
        await db.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      }
    }

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
