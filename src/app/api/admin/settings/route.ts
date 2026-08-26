import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * Determine which table a setting key belongs to:
 * - SiteSetting: siteName, tagline, logoUrl, SEO defaults, and
 *   headerConfig{asterisk}/footerConfig{asterisk} (including locale
 *   variants like headerConfigGuest_fa)
 * - Setting: everything else (legacy config)
 */
function isSiteSettingKey(key: string): boolean {
  const exactKeys = new Set([
    'siteName', 'tagline', 'logoUrl', 'faviconUrl',
    'defaultSeoTitle', 'defaultSeoDescription',
    // Appearance (hex colors enforced separately)
    'bgColorLight', 'primaryColor', 'accentColor',
    // Contact & locale
    'supportEmail', 'contactPhone', 'defaultLocale',
    // SEO / operations toggles
    'allowSearchIndexing', 'maintenanceMode',
    // Booking rules
    'minBookingLeadHours', 'maxBookingDaysAhead',
    // Payments
    'paymentsEnabled', 'paymentsActivatedAt', 'paymentsActivatedBy',
  ])
  if (exactKeys.has(key)) return true
  if (key.startsWith('headerConfig') || key.startsWith('footerConfig')) return true
  return false
}

// Validation applied to SiteSetting values before persistence.
// Returns an error message, or null when valid.
function validateSettingValue(key: string, value: string): string | null {
  const hexKeys = new Set(['bgColorLight', 'primaryColor', 'accentColor'])
  if (hexKeys.has(key)) {
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
      return `${key}: must be a hex color like #1A73E8`
    }
    return null
  }
  if (key === 'defaultLocale' && value && !['en', 'tr', 'fa', 'ar', 'ru'].includes(value)) {
    return 'defaultLocale: must be one of en, tr, fa, ar, ru'
  }
  if ((key === 'allowSearchIndexing' || key === 'maintenanceMode' || key === 'paymentsEnabled') && !['true', 'false'].includes(value)) {
    return `${key}: must be "true" or "false"`
  }
  if (key === 'supportEmail' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    return 'supportEmail: invalid email address'
  }
  if ((key === 'minBookingLeadHours' || key === 'maxBookingDaysAhead') && value && !/^\d{1,5}$/.test(value)) {
    return `${key}: must be a non-negative whole number`
  }
  return null
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
  settings: z.record(
    z.string().regex(/^[a-zA-Z0-9_]{1,64}$/),
    z.string().max(10_000)
  ),
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
      const err = isSiteSettingKey(key) ? validateSettingValue(key, value) : null
      if (err) return error(400, err)
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
      const err = isSiteSettingKey(key) ? validateSettingValue(key, value) : null
      if (err) return error(400, err)
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
