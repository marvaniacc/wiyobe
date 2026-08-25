import { NextResponse } from 'next/server'
import { resolveGoogleUser, storePendingGoogleSignup } from '@/lib/google-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/callback/google
 *
 * OAuth authorization-code callback:
 *   1. Validate the state cookie (CSRF) and parse role/redirect from state
 *   2. Exchange the authorization code for tokens (client_secret auth)
 *   3. Decode the id_token returned directly by Google's token endpoint
 *      (fetched over TLS from Google — no audience tampering possible; aud
 *      is still checked against our client id)
 *   4. Resolve/link/create the account (email_verified enforced) and start
 *      a session, then redirect to the intended page.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  // Behind the reverse proxy req.url resolves to localhost — use the public URL
  // for redirects AND for the token-exchange redirect_uri (must match /start).
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://wishubest.com'
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/en/login?error=${encodeURIComponent(reason)}`, origin))

  if (errorParam) return fail(errorParam === 'access_denied' ? 'Google sign-in was cancelled' : errorParam)
  if (!code || !state) return fail('Missing Google sign-in parameters')

  // ── CSRF: state must match the cookie set by /start ──
  const cookieState = req.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('g_state='))
    ?.slice('g_state='.length)
  if (!cookieState || !state.startsWith(`${cookieState}.`)) {
    return fail('Invalid Google sign-in state. Please try again.')
  }

  let role = 'PATIENT'
  let redirect = '/dashboard'
  let mode = 'login'
  try {
    const payload = JSON.parse(Buffer.from(state.split('.')[1], 'base64url').toString('utf8'))
    if (typeof payload.role === 'string') role = payload.role
    if (typeof payload.redirect === 'string' && payload.redirect.startsWith('/')) redirect = payload.redirect
    if (payload.mode === 'signup') mode = 'signup'
  } catch {
    return fail('Invalid Google sign-in state')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return fail('Google sign-in is not configured')

  // ── Exchange the code for tokens ──
  let idToken: string
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.id_token) {
      console.error('[google-callback] token exchange failed:', tokens.error_description || tokens.error)
      return fail('Google sign-in failed. Please try again.')
    }
    idToken = tokens.id_token
  } catch (e: any) {
    console.error('[google-callback] token exchange error:', e?.message)
    return fail('Google sign-in failed. Please try again.')
  }

  // ── Decode the id_token payload (obtained directly from Google over TLS) ──
  let claims: any
  try {
    claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return fail('Google sign-in failed. Please try again.')
  }
  if (claims.aud !== clientId) return fail('Google sign-in failed. Please try again.')

  // SECURITY: never log in or link accounts on unverified emails.
  if (!claims.email || claims.email_verified !== true) {
    return fail('Your Google email address is not verified. Verify it with Google first, then try again.')
  }

  const googleInfo = {
    sub: claims.sub,
    email: claims.email,
    email_verified: claims.email_verified,
    name: claims.name,
    picture: claims.picture || null,
    locale: claims.locale,
  }

  // Does a matching account already exist? (by googleId or verified email)
  const existing = (await db.user.findFirst({
    where: { OR: [{ googleId: googleInfo.sub }, { email: googleInfo.email }] },
    select: { id: true },
  }))

  let result
  if (existing) {
    result = await resolveGoogleUser(googleInfo, role, false)
  } else {
    // NEW Google identity — the user picks their role AFTER the redirect
    // (role selection page); claims are held server-side behind a token.
    const token = storePendingGoogleSignup(googleInfo, redirect)
    const locale = redirect.split('/')[1]
    const loc = ['en', 'tr', 'fa', 'ar', 'ru'].includes(locale as any) ? locale : 'en'
    const res = NextResponse.redirect(new URL(`/${loc}/complete-signup?token=${token}`, origin))
    res.cookies.delete('g_state')
    return res
  }

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/en/login?error=${encodeURIComponent(result.message)}`, origin))
  }

  // Signed up with Google but an account already existed → welcome them back
  // explicitly instead of a silent sign-in.
  const target = new URL(redirect, origin)
  if (mode === 'signup' && !result.isNewUser) {
    target.searchParams.set('notice', 'Welcome back! An account already existed for this Google account, so we signed you in.')
  }
  const res = NextResponse.redirect(target)
  res.cookies.delete('g_state')
  return res
}
