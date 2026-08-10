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

function verifyToken<T = any>(token: string): T | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export async function setSessionCookie(userId: string, role: string) {
  const token = signToken({ uid: userId, role, iat: Date.now() })
  const c = await cookies()
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
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
}

export async function getSession(): Promise<SessionUser | null> {
  const token = await getSessionToken()
  if (!token) return null
  const payload = verifyToken<{ uid: string; role: string }>(token)
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
    },
  })
  if (!user || user.status === 'SUSPENDED') return null
  return user as SessionUser
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
