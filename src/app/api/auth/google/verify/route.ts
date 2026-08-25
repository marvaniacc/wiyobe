import { resolveGoogleUser, type GoogleUserInfo } from '@/lib/google-auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  // Google ID token (from GIS) OR demo email when explicitly enabled in dev
  idToken: z.string().optional(),
  demoEmail: z.string().email().optional(),
  demoName: z.string().optional(),
  role: z.enum(['PATIENT', 'DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']).default('PATIENT'),
})

async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserInfo | null> {
  // Verify the ID token using Google's tokeninfo endpoint
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Verify audience matches our client ID if configured
    if (process.env.GOOGLE_CLIENT_ID && data.aud !== process.env.GOOGLE_CLIENT_ID) {
      return null
    }
    return {
      sub: data.sub,
      email: data.email,
      email_verified: data.email_verified === 'true' || data.email_verified === true,
      name: data.name,
      picture: data.picture,
      locale: data.locale,
    }
  } catch {
    return null
  }
}

/**
 * POST /api/auth/google/verify
 *
 * GIS (Google Identity Services) idToken sign-in. The redirect-based flow
 * lives at /api/auth/google/start → /api/auth/callback/google; both share
 * the account resolution logic in lib/google-auth.ts.
 */
export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)

    let googleInfo: GoogleUserInfo | null = null
    let isDemo = false

    if (body.idToken) {
      // Real Google OAuth flow
      googleInfo = await verifyGoogleIdToken(body.idToken)
      if (!googleInfo || !googleInfo.email) {
        return error(401, 'Google authentication failed. Invalid or expired token.')
      }
      // SECURITY: never log in or LINK accounts on unverified emails.
      // Google issues tokens with email_verified=false for unverified
      // Workspace domains — allowing them would enable account takeover of
      // the matching local account by email claim.
      if (!googleInfo.email_verified) {
        return error(401, 'Your Google email address is not verified. Verify it with Google first, then try again.')
      }
    } else if (body.demoEmail && process.env.AUTH_DEMO_MODE === '1' && process.env.NODE_ENV !== 'production') {
      // Demo mode — requires BOTH an explicit opt-in flag (AUTH_DEMO_MODE=1)
      // and a non-production NODE_ENV. Never available by default: this path
      // logs the caller in as any email without credentials.
      isDemo = true
      googleInfo = {
        sub: `demo_${Buffer.from(body.demoEmail).toString('hex')}`,
        email: body.demoEmail,
        email_verified: true,
        name: body.demoName || body.demoEmail.split('@')[0],
        picture: null,
        locale: 'en',
      }
    } else if (body.demoEmail) {
      // Reject demoEmail everywhere else — prevents authentication bypass by
      // impersonating any email address.
      return error(403, 'Demo authentication is not available.')
    } else {
      return error(400, 'Either idToken or demoEmail is required.')
    }

    // Defensive guard — after the branches above, googleInfo must be set (all
    // failing paths return early). This satisfies the type-checker.
    if (!googleInfo) return error(500, 'Authentication state error')

    const result = await resolveGoogleUser(googleInfo, body.role)
    if (!result.ok) return error(result.status, result.message)

    return json({
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        name: result.user.name,
        status: result.user.status,
        preferredLanguage: result.user.preferredLanguage,
      },
      isNewUser: result.isNewUser,
      needsApproval: result.needsApproval,
      demo: isDemo,
    }, result.isNewUser ? 201 : 200)
  } catch (e) { return handleError(e) }
}
