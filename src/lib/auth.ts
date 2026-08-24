import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const SECRET = process.env.AUTH_SECRET
if (!SECRET) {
  throw new Error('AUTH_SECRET environment variable is required. Set it in your .env file.')
}
// Re-bind to a narrowed type so downstream usages are guaranteed non-null.
const AUTH_SECRET: string = SECRET
const COOKIE_NAME = 'mt_session'
const SESSION_TTL_MS = 60 * 60 * 24 * 7 // 7 days

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const test = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
}

function signToken(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function verifyToken<T = any>(token: string): T | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  // Length-safe comparison — a mismatched-length signature must be treated as
  // an invalid token, not crash with ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTHS.
  if (!safeEqual(sig, crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url'))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { iat?: number; exp?: number }
    // Enforce expiry server-side (cookie maxAge is not enforcement).
    if (typeof payload.exp === 'number') {
      if (payload.exp < Date.now()) return null
    } else if (typeof payload.iat === 'number') {
      // Legacy tokens without exp: fall back to iat + TTL.
      if (payload.iat + SESSION_TTL_MS < Date.now()) return null
    }
    return payload as T
  } catch {
    return null
  }
}

export async function setSessionCookie(userId: string, role: string) {
  const now = Date.now()
  const token = signToken({ uid: userId, role, iat: now, exp: now + SESSION_TTL_MS })
  const c = await cookies()
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function clearSessionCookie() {
  const c = await cookies()
  c.delete(COOKIE_NAME)
}

export async function getSessionToken(): Promise<string | undefined> {
  const c = await cookies()
  return c.get(COOKIE_NAME)?.value
}

export type SessionUser = {
  id: string
  email: string
  role: string
  name: string | null
  status: string
  preferredLanguage: string
  avatarUrl: string | null
  kycStatus: string
}

export async function getSession(): Promise<SessionUser | null> {
  const token = await getSessionToken()
  if (!token) return null
  const payload = verifyToken<{ uid: string; role: string; iat?: number }>(token)
  if (!payload) return null
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      status: true,
      preferredLanguage: true,
      avatarUrl: true,
      kycStatus: true,
      sessionsInvalidAfter: true,
    },
  })
  if (!user || user.status === 'SUSPENDED') return null
  // Revocation: reject tokens issued before the invalidation timestamp.
  if (payload.iat && user.sessionsInvalidAfter && payload.iat < user.sessionsInvalidAfter.getTime()) return null
  const { sessionsInvalidAfter: _ignored, ...session } = user
  return session as SessionUser
}

/**
 * Invalidate all existing session tokens for a user (e.g. after a password
 * reset or suspension). New logins mint tokens with a fresh iat and remain valid.
 */
export async function invalidateSessions(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { sessionsInvalidAfter: new Date() },
  })
}

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession()
  if (!s) throw new Error('UNAUTHORIZED')
  return s
}

export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const s = await requireUser()
  if (!roles.includes(s.role)) throw new Error('FORBIDDEN')
  return s
}
