import { clearSessionCookie } from '@/lib/auth'
import { json, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/signout
 *
 * Clears the session cookie and redirects to /en via a client-side
 * meta-refresh. We deliberately do NOT use NextResponse.redirect()
 * because behind a reverse proxy (Caddy), req.nextUrl resolves to
 * localhost:3000 — causing the browser to redirect to localhost
 * instead of the actual domain (wishubest.com).
 *
 * A meta-refresh with a RELATIVE url (/en) lets the browser resolve
 * the URL against the actual domain it's visiting.
 */
export async function GET() {
  try {
    await clearSessionCookie()
  } catch {
    // Continue — redirect even if cookie clear fails
  }

  // Return a minimal HTML page that immediately redirects to /en.
  // The browser resolves /en relative to the current domain.
  return new Response(
    `<!DOCTYPE html><html><head>` +
    `<meta http-equiv="refresh" content="0;url=/en">` +
    `</head><body></body></html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    },
  )
}

/**
 * POST /api/auth/signout
 *
 * Clears the session cookie. Returns JSON { ok: true } for fetch-based
 * signout (used by the dashboard shell's signout button). The caller
 * does a client-side window.location.href = '/en' after this returns.
 */
export async function POST() {
  try {
    await clearSessionCookie()
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
