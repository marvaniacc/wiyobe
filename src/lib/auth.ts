import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import crypto from 'crypto'

// ============================================================================
// Auth — simple, database-backed opaque session tokens.
//
// Design:
//   • Login issues a 256-bit random token stored in an httpOnly cookie.
//   • Only a SHA-256 hash of the token is persisted (DB leak ≠ session theft).
//   • Every request resolves cookie → Session row → User row. One source of
//     truth: deleting the row revokes the session everywhere, instantly.
//   • Expired rows are deleted lazily on access and opportunistically on login.
//
// Public API (unchanged — 80+ routes depend on it):
//   getSession(), requireUser(), requireRole(...roles), setSessionCookie(),
//   clearSessionCookie(), invalidateSessions(userId),
//   hashPassword(), verifyPassword(), type SessionUser
// ============================================================================

const COOKIE_NAME = 'mt_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000

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

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function hashToken(rawToken: string): string {
  return sha256(rawToken)
}

export async function setSessionCookie(userId: string, _role?: string) {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  const c = await cookies()
  c.set(COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  // Opportunistic cleanup of dead sessions (expired or stale beyond TTL).
  db.session
    .deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { createdAt: { lt: new Date(Date.now() - SESSION_TTL_MS * 2) } },
        ],
      },
    })
    .catch(() => {})
}

export async function clearSessionCookie() {
  const c = await cookies()
  const rawToken = c.get(COOKIE_NAME)?.value
  if (rawToken) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } }).catch(() => {})
  }
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
  const rawToken = await getSessionToken()
  if (!rawToken) return null

  let session
  try {
    session = await db.session.findUnique({ where: { tokenHash: hashToken(rawToken) } })
  } catch {
    return null // DB unavailable — fail closed
  }
  if (!session) return null

  // Expired session → revoke it and treat as logged out.
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      status: true,
      preferredLanguage: true,
      avatarUrl: true,
      kycStatus: true,
    },
  })
  if (!user || user.status === 'SUSPENDED') return null
  return user as SessionUser
}

/**
 * Revoke every session belonging to a user (password reset, suspension, etc).
 */
export async function invalidateSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } }).catch(() => {})
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
