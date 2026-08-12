import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const PROVIDER_ROLES = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']

/**
 * Builds the absolute, externally-subscribable iCal feed URL for a token.
 * Uses the APP_URL env var (set in production) and falls back to the
 * request origin so it works in preview/dev environments.
 */
function buildFeedUrl(token: string, req: Request): string {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    return `${appUrl.replace(/\/$/, '')}/api/calendar/${token}`
  }
  // Derive origin from the request headers (works behind the Caddy gateway).
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}/api/calendar/${token}`
  }
  return `/api/calendar/${token}`
}

/**
 * GET /api/provider/calendar
 *
 * Returns the authenticated provider's calendar feed token and the full
 * subscribable URL. The token is generated on-demand if it does not yet
 * exist, so a provider always gets a usable feed URL on first visit.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (!PROVIDER_ROLES.includes(session.role)) return error(403, 'Forbidden')

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { id: true, calendarToken: true },
    })
    if (!user) return error(404, 'Not found')

    // Lazily mint a token the first time the provider opens Calendar Sync.
    let token = user.calendarToken
    if (!token) {
      token = crypto.randomUUID()
      await db.user.update({ where: { id: session.id }, data: { calendarToken: token } })
    }

    return json({ token, feedUrl: buildFeedUrl(token, req) })
  } catch (e) { return handleError(e) }
}

/**
 * POST /api/provider/calendar
 *
 * Regenerates the calendar feed token. The previous token is invalidated
 * immediately, so any external calendar subscribed to the old URL will stop
 * receiving updates until the provider re-subscribes with the new URL.
 *
 * This is useful if a provider accidentally shares the URL publicly and
 * wants to revoke access.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (!PROVIDER_ROLES.includes(session.role)) return error(403, 'Forbidden')

    const token = crypto.randomUUID()
    await db.user.update({ where: { id: session.id }, data: { calendarToken: token } })

    return json({ token, feedUrl: buildFeedUrl(token, req), regenerated: true })
  } catch (e) { return handleError(e) }
}
