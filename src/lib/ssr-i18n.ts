/**
 * Server-side i18n helper for SSR (Server Components, API routes).
 *
 * Mirrors the client-side `translate` function from `@/lib/i18n` but is
 * safe to call from async Server Components and route handlers.
 *
 * Usage: `ssrT(locale, 'some.key', 'Fallback text')`
 */
import { DICTS, type Locale } from '@/lib/i18n'

/**
 * Look up a translation key for the given locale, falling back to:
 *  1. The English dict (DICTS.en)
 *  2. The provided `fallback` string
 *  3. The key itself
 */
export function ssrT(locale: string, key: string, fallback?: string): string {
  const loc = (locale as Locale) || 'en'
  const dict = DICTS[loc]
  if (dict && key in dict && dict[key]) {
    return dict[key]
  }
  // Fall back to English dict
  if (DICTS.en && key in DICTS.en && DICTS.en[key]) {
    return DICTS.en[key]
  }
  // Fall back to the provided string, or the key itself
  return fallback ?? key
}
