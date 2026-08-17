'use client'

/**
 * CookiePreferencesButton — client island embedded in the PublicFooter
 * (a server component).
 *
 * Clears the stored cookie consent in localStorage, which causes the
 * CookieConsentBanner to re-appear on the next render (its useEffect
 * detects the missing/old entry). Completes the GDPR consent lifecycle:
 * the user can withdraw or change consent at any time, not just at
 * first visit.
 */
export function CookiePreferencesButton() {
  function handleClick() {
    try {
      localStorage.removeItem('wishubest_cookie_consent_v1')
      localStorage.removeItem('wishubest_cookie_consent_granular_v1')
    } catch {
      // localStorage unavailable (private mode) — no-op
    }
    // Force a reload so the banner re-mounts and re-prompts.
    // A full reload is the most reliable cross-page way to re-trigger
    // the banner's mount-time useEffect.
    window.location.reload()
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-muted-foreground transition-colors hover:text-primary"
      type="button"
    >
      Cookie preferences
    </button>
  )
}
