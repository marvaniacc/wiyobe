/**
 * Verify a Cloudflare Turnstile token server-side.
 * Skips verification only when no secret is configured (dev mode).
 * A missing token when the secret IS configured fails closed.
 */
export async function verifyTurnstileToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    })
    const data = await res.json()
    return data.success === true
  } catch {
    return false
  }
}

// ── Resend grace: a Turnstile token is single-use, but a user verifying a
// signup code may need to resend it. Track emails that already passed the
// challenge so resends within the TTL don't demand a fresh token.
const g = globalThis as unknown as { __turnstilePassed?: Map<string, number> }
const passed: Map<string, number> = g.__turnstilePassed ?? (g.__turnstilePassed = new Map())
const PASS_TTL_MS = 30 * 60 * 1000

export function markTurnstilePassed(email: string) {
  passed.set(email.toLowerCase(), Date.now())
  if (passed.size > 5000) {
    const now = Date.now()
    for (const [k, ts] of passed) if (now - ts > PASS_TTL_MS) passed.delete(k)
  }
}

export function hasTurnstilePassed(email: string): boolean {
  const ts = passed.get(email.toLowerCase())
  if (!ts) return false
  if (Date.now() - ts > PASS_TTL_MS) {
    passed.delete(email.toLowerCase())
    return false
  }
  return true
}
