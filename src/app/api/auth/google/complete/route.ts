import { db } from '@/lib/db'
import { resolveGoogleUser, takePendingGoogleSignup } from '@/lib/google-auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  token: z.string().min(20).max(200),
  role: z.enum(['PATIENT', 'DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR', 'AFFILIATE']),
})

/**
 * POST /api/auth/google/complete
 *
 * Final step of the Google signup flow: the user has authenticated with
 * Google (claims held server-side behind a short-lived token) and has now
 * chosen a role. Creates the account (ACTIVE — providers land in the
 * KYC-locked dashboard), starts a session, and returns the redirect target.
 */
export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)
    const pendingEntry = takePendingGoogleSignup(body.token)
    if (!pendingEntry) {
      return error(410, 'This signup session expired. Please sign in with Google again.')
    }

    const result = await resolveGoogleUser(pendingEntry.claims, body.role, true)
    if (!result.ok) return error(result.status, result.message)

    return json({
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        name: result.user.name,
        status: result.user.status,
        preferredLanguage: result.user.preferredLanguage,
      },
      isNewUser: result.isNewUser,
      redirect: pendingEntry.redirect || '/dashboard',
    })
  } catch (e) { return handleError(e) }
}
