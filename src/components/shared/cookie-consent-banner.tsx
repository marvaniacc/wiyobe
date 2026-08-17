'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/shared/icon'

const CONSENT_KEY = 'wishubest_cookie_consent_v1'
const CONSENT_GRANULAR_KEY = 'wishubest_cookie_consent_granular_v1'

type ConsentState = 'accepted_all' | 'accepted_essential' | 'rejected' | null

type StoredConsent = {
  state: ConsentState
  timestamp: number
  // Per-category flags for granular control
  essential: boolean // always true — session, locale, security
  functional: boolean // preferences, language
  analytics: boolean // usage stats (not currently used, but reserved)
}

const CURRENT_VERSION = 1 // bump to re-prompt existing users after policy changes

/**
 * CookieConsentBanner — GDPR-compliant cookie consent.
 *
 * Shows on first visit (no consent recorded in localStorage). Offers three
 * actions: Accept all, Accept essential only, Reject. Also exposes a
 * "Cookie preferences" link to the Privacy Policy page.
 *
 * Consent is stored under `wishubest_cookie_consent_v1` with a version
 * suffix — bumping CURRENT_VERSION re-prompts all users whose stored
 * version is older.
 *
 * Essential cookies (session, locale, affiliate referral) are ALWAYS set
 * regardless of consent — they are strictly necessary for the site to
 * function and are exempt from consent under GDPR Article 6(1)(b)/(f).
 */
export function CookieConsentBanner({ locale }: { locale: string }) {
  const [visible, setVisible] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [functional, setFunctional] = useState(true)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONSENT_KEY)
      if (!raw) {
        // No consent recorded — show banner
        setVisible(true)
        return
      }
      const parsed = JSON.parse(raw) as { version?: number; state: ConsentState }
      if (parsed.version !== CURRENT_VERSION) {
        // Policy changed — re-prompt
        setVisible(true)
      }
    } catch {
      // Corrupt entry — re-prompt
      setVisible(true)
    }
  }, [])

  function persist(state: Exclude<ConsentState, null>): void {
    const record: StoredConsent = {
      state,
      timestamp: Date.now(),
      essential: true, // always
      functional: state === 'accepted_all' ? functional : state === 'accepted_essential',
      analytics: state === 'accepted_all' ? analytics : false,
    }
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CURRENT_VERSION, ...record }))
      // Mirror to the granular key for any future client-side readers
      localStorage.setItem(CONSENT_GRANULAR_KEY, JSON.stringify(record))
    } catch {
      // localStorage disabled (private mode) — banner just hides
    }
    setVisible(false)
  }

  function handleAcceptAll() {
    setFunctional(true)
    setAnalytics(true)
    persist('accepted_all')
  }

  function handleAcceptEssential() {
    setFunctional(false)
    setAnalytics(false)
    persist('accepted_essential')
  }

  function handleReject() {
    setFunctional(false)
    setAnalytics(false)
    persist('rejected')
  }

  function handleSavePreferences() {
    persist(functional || analytics ? 'accepted_all' : 'accepted_essential')
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[20px] border border-divider bg-surface shadow-2xl">
        {/* Header row */}
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden>
              cookie
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              We value your privacy
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              We use essential cookies to make the site work (session, language,
              affiliate tracking). With your consent, we also use optional cookies
              to improve functionality and analyse usage. See our{' '}
              <Link
                href={`/${locale}/privacy`}
                className="font-medium text-primary hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <button
            onClick={() => setVisible(false)}
            aria-label="Dismiss"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Preferences panel (collapsible) */}
        {showPreferences && (
          <div className="space-y-3 border-t border-divider bg-surface-secondary/50 p-4 sm:p-5">
            <CookieToggle
              label="Essential cookies"
              desc="Required for the site to function: session, language, security, affiliate tracking. Always on."
              checked={true}
              disabled
            />
            <CookieToggle
              label="Functional cookies"
              desc="Remember your preferences (e.g. dashboard layout, filters)."
              checked={functional}
              onChange={setFunctional}
            />
            <CookieToggle
              label="Analytics cookies"
              desc="Anonymous usage statistics to help us improve. No personal data."
              checked={analytics}
              onChange={setAnalytics}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-divider bg-surface p-3 sm:p-4">
          <Button
            size="sm"
            onClick={handleAcceptAll}
            className="gap-1.5"
          >
            <Icon name="check" size={14} />
            Accept all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAcceptEssential}
            className="gap-1.5"
          >
            Essential only
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReject}
            className="gap-1.5 text-muted-foreground"
          >
            Reject
          </Button>
          <div className="ms-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPreferences((p) => !p)}
              className="gap-1.5 text-muted-foreground"
            >
              <Icon name={showPreferences ? 'expand_less' : 'tune'} size={14} />
              {showPreferences ? 'Hide preferences' : 'Cookie preferences'}
            </Button>
          </div>
          {showPreferences && (
            <Button
              size="sm"
              onClick={handleSavePreferences}
              className="gap-1.5"
            >
              <Icon name="save" size={14} />
              Save preferences
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function CookieToggle({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <label
      className={`flex items-start gap-3 ${disabled ? 'opacity-70' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 size-4 rounded border-divider accent-primary"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </label>
  )
}
