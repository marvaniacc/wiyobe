import { getSession } from '@/lib/auth'
import { json, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/session
 *
 * Returns the current authenticated session (or null). Used by:
 *  - default-landing.tsx (SPA session bootstrap)
 *  - auth-form.tsx (check if user is already logged in)
 *
 * This is a dedicated session-check endpoint — previously the session
 * bootstrap used GET /api/auth/signup which was misleading.
 */
export async function GET() {
  try {
    const session = await getSession()
    return json({ session })
  } catch (e) { return handleError(e) }
}
