/**
 * Feature flags — build-time switches for patient-facing surface area.
 *
 * Flag values are read from environment variables and INLINED AT BUILD TIME
 * (client components can only see NEXT_PUBLIC_* vars). Changing a flag
 * requires setting the env var and re-running the build (i.e. a deploy).
 *
 * NOTE: `.env` is loaded by Next automatically; on the VPS the flag lives in
 * /opt/wiyobe/.env. ABSENCE of the variable always means the DEFAULT below.
 */

/**
 * SHOW_LEGACY_PROVIDER_TYPES
 *
 * Controls patient-facing visibility of the legacy provider types
 * (Hospital / Hotel / Translator) and the Itineraries feature during the
 * Cross-Border Doctor Marketplace pivot.
 *
 *   - false (default, flag OFF): legacy provider types are HIDDEN from
 *     patient-facing navigation and signup:
 *       - public header nav
 *       - public footer
 *       - patient dashboard "Itineraries" sidebar item
 *       - patient dashboard Browse type-filter tabs
 *       - public provider-listing type nav pills (doctors/hospitals/hotels/
 *         translators pages)
 *       - default homepage tagline copy
 *       - sitemap.xml (legacy listings + provider detail URLs are not emitted)
 *       - signup / Google-signup role selection
 *     Legacy PAGES remain fully reachable by DIRECT URL — no redirects,
 *     no 404s, no API changes, and existing legacy-type accounts keep full
 *     dashboard access.
 *
 *   - true (flag ON): everything renders exactly as before this flag existed.
 */
export const SHOW_LEGACY_PROVIDER_TYPES =
  process.env.NEXT_PUBLIC_SHOW_LEGACY_PROVIDER_TYPES === 'true'

/** Path classifier: does this href point at a legacy provider-type listing? */
export function isLegacyListingPath(path: string): boolean {
  return /\/(hospitals|hotels|translators)(\/|\?|#|$)/.test(path || '')
}
