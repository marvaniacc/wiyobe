import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * Determine which table a setting key belongs to:
 * - SiteSetting: siteName, tagline, logoUrl, SEO defaults, and
 *   headerConfig*/footerConfig* (including locale variants like
 *   headerConfigGuest_fa)
 * - Setting: everything else (legacy config)
 */
function isSiteSettingKey(key: string): boolean {
  const exactKeys = new Set([
    'siteName', 'tagline', 'logoUrl',
    'defaultSeoTitle', 'defaultSeoDescription',
  ])
  if (exactKeys.has(key)) return true
  if (key.startsWith('headerConfig') || key.startsWith('footerConfig')) return true
  return false
}

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
 * Bulk-upsert settings. Routes each key to the appropriate model
 * (SiteSetting or Setting) based on isSiteSettingKey().
 */
export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { settings } = await parseBody(req, updateSchema)

    for (const [key, value] of Object.entries(settings)) {
      if (isSiteSettingKey(key)) {
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

const patchSchema = z.record(z.string(), z.string())

/**
 * PATCH /api/admin/settings
 *
 * Upsert individual settings (key-value pairs). Body is a flat object
 * like { headerConfigGuest: '{"menuItems":[...]}', footerConfig: '...' }.
 * Routes each key to the correct table via isSiteSettingKey().
 */
export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, patchSchema)

    for (const [key, value] of Object.entries(body)) {
      if (isSiteSettingKey(key)) {
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
