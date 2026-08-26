import { db } from '@/lib/db'

/**
 * Site settings — single source of truth for admin-configurable platform
 * configuration stored in the SiteSetting table.
 *
 * All values have safe production defaults so the app renders correctly on a
 * fresh database with no settings rows at all.
 */

export const SETTING_DEFAULTS = {
  // Identity
  siteName: 'Wishubest',
  tagline: 'Global Medical Tourism Marketplace',
  logoUrl: '',
  faviconUrl: '',
  // Appearance
  bgColorLight: '#F8F9FA',
  primaryColor: '#1A73E8',
  accentColor: '#E8F0FE',
  forceDarkDefault: 'false',
  // Contact / SEO
  supportEmail: '',
  contactPhone: '',
  defaultSeoTitle: '',
  defaultSeoDescription: '',
  allowSearchIndexing: 'true',
  defaultLocale: 'en',
  // Operations
  maintenanceMode: 'false',
  minBookingLeadHours: '2',
  maxBookingDaysAhead: '180',
  // Payments
  paymentsEnabled: 'false',
} as const

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type SiteSettings = Record<SettingKey, string>

/** Fetch all settings merged over defaults. Safe on DB errors. */
export async function getSiteSettings(): Promise<SiteSettings> {
  const merged: Record<string, string> = { ...SETTING_DEFAULTS }
  try {
    const rows = await db.siteSetting.findMany()
    for (const r of rows) {
      if (r.value != null && r.key in SETTING_DEFAULTS) merged[r.key] = r.value
    }
  } catch {
    // DB unavailable — fall back to defaults rather than crashing SSR.
  }
  return merged as SiteSettings
}

export async function getSetting(key: SettingKey): Promise<string> {
  try {
    const row = await db.siteSetting.findUnique({ where: { key } })
    return row?.value ?? SETTING_DEFAULTS[key]
  } catch {
    return SETTING_DEFAULTS[key]
  }
}

export function isHexColor(v: string | undefined | null): boolean {
  return !!v && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())
}

/** Normalize #RGB to #RRGGBB; returns null when invalid. */
export function normalizeHex(v: string | undefined | null): string | null {
  if (!isHexColor(v)) return null
  const s = v!.trim()
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase()
  }
  return s.toLowerCase()
}
