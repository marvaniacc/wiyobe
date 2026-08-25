import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/google/start?role=PATIENT&redirect=/en
 *
 * Kicks off the Google OAuth authorization-code flow: sets a CSRF state
 * cookie and redirects to Google's consent screen. The redirect_uri is the
 * one registered in the Google Cloud console
 * (https://wishubest.com/api/auth/callback/google).
 */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.redirect(new URL('/en/login?error=google-not-configured', req.url))
  }

  const { searchParams } = new URL(req.url)
  const role = (searchParams.get('role') || 'PATIENT').toUpperCase()
  const redirect = searchParams.get('redirect') || '/dashboard'
  // mode=login → existing accounts only (new users are sent to signup to
  // choose a role); mode=signup → create the account with the chosen role.
  const mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login'
  // Behind the reverse proxy req.url resolves to localhost — always use the
  // public app URL for the Google redirect_uri (must match the console registration).
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://wishubest.com'

  // CSRF protection: random state, bound to an httpOnly cookie that the
  // callback must match. Also carries the intended role + post-login redirect.
  const nonce = crypto.randomBytes(16).toString('hex')
  const state = `${nonce}.${Buffer.from(JSON.stringify({ role, redirect, mode })).toString('base64url')}`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', `${origin}/api/auth/callback/google`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('prompt', 'select_account')

  const res = NextResponse.redirect(authUrl.toString())
  res.cookies.set('g_state', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600, // 10 minutes to complete consent
  })
  return res
}
