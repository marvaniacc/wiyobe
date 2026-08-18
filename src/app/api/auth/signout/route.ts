import { clearSessionCookie } from '@/lib/auth'
import { json, handleError } from '@/lib/api'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/signout
 *
 * Clears the session cookie and redirects to /en (locale landing).
 * Supports both GET (link navigation) and POST (fetch) methods so that
 * the public header's <a href="/api/auth/signout"> link works without
 * any client-side JavaScript.
 */
export async function GET() {
  try {
    await clearSessionCookie()
    return NextResponse.redirect(new URL('/en', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'), 302)
  } catch (e) {
    // Fallback — redirect even if cookie clear fails
    return NextResponse.redirect(new URL('/en', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'), 302)
  }
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
