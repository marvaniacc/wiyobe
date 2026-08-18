import { clearSessionCookie } from '@/lib/auth'
import { json, handleError } from '@/lib/api'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/signout
 *
 * Clears the session cookie and redirects to /en (locale landing).
 * Uses the REQUEST's own URL to construct the redirect — NOT
 * NEXT_PUBLIC_APP_URL (which may be unset or set to localhost:3000
 * in dev, causing a redirect to localhost on production).
 */
export async function GET(req: NextRequest) {
  try {
    await clearSessionCookie()
  } catch {
    // Continue even if cookie clear fails — still redirect
  }
  // Construct redirect URL from the request's own host (preserves
  // the domain the user is actually visiting, e.g. wishubest.com)
  const url = req.nextUrl
  url.pathname = '/en'
  url.search = ''
  return NextResponse.redirect(url, 302)
}

/**
 * POST /api/auth/signout
 *
 * Clears the session cookie. Returns JSON { ok: true } for fetch-based
 * signout (used by the dashboard shell's signout button).
 */
export async function POST() {
  try {
    await clearSessionCookie()
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
