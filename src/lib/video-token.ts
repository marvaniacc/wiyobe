import crypto from 'crypto'

// ============================================================================
// Video join tokens — short-lived HMAC proof that the bearer was authorized
// by the Wiyobe backend to enter a specific video-consultation room.
//
// Threat model: video rooms live on meet.jit.si (public). The room NAME is
// now high-entropy (CSPRNG, see generateRoomName), so it cannot be guessed,
// but anyone who LEARNS the URL could still enter the room. This token does
// not change that (public Jitsi cannot verify our signatures); what it does
// do is make sure the room URL is never handed out by our API except to the
// booking's patient / provider / an admin, and that any leaked URL material
// expires: the join link we serve is only valid for VIDEO_TOKEN_TTL_SECONDS.
//
// Format: base64url(payload).base64url(hmac)  where payload is JSON
//   { b: bookingId, i: issuedAtMs, x: expiresAtMs, n: nonce }
// Signed with AUTH_SECRET (64-char hex in production .env). Fail-closed: if
// AUTH_SECRET is missing, token issuance and verification both refuse.
// ============================================================================

export const VIDEO_TOKEN_TTL_SECONDS = 5 * 60 // 5 minutes

function getSigningKey(): string | null {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) return null
  return secret
}

export function isVideoTokenConfigured(): boolean {
  return getSigningKey() !== null
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function sign(payloadB64: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payloadB64).digest('base64url')
}

/** Issue a signed join token bound to one booking. Throws if AUTH_SECRET is missing. */
export function issueVideoJoinToken(bookingId: string): { token: string; expiresAt: Date } {
  const key = getSigningKey()
  if (!key) throw new Error('VIDEO_TOKEN_NO_SECRET')
  const now = Date.now()
  const payload = {
    b: bookingId,
    i: now,
    x: now + VIDEO_TOKEN_TTL_SECONDS * 1000,
    n: crypto.randomBytes(8).toString('hex'),
  }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf-8'))
  const mac = sign(payloadB64, key)
  return { token: `${payloadB64}.${mac}`, expiresAt: new Date(payload.x) }
}

export type VideoTokenVerification =
  | { ok: true; bookingId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

/** Verify a join token. Constant-time MAC compare. Checks binding + expiry. */
export function verifyVideoJoinToken(token: string): VideoTokenVerification {
  const key = getSigningKey()
  if (!key) return { ok: false, reason: 'bad_signature' }

  const dot = token.indexOf('.')
  if (dot <= 0 || token.includes('.', dot + 1)) return { ok: false, reason: 'malformed' }
  const payloadB64 = token.slice(0, dot)
  const mac = token.slice(dot + 1)

  let payload: { b?: unknown; x?: unknown }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof payload.b !== 'string' || typeof payload.x !== 'number') {
    return { ok: false, reason: 'malformed' }
  }

  const expected = sign(payloadB64, key)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }

  if (payload.x < Date.now()) return { ok: false, reason: 'expired' }

  return { ok: true, bookingId: payload.b }
}

// ============================================================================
// Room-name generation — high-entropy, CSPRNG, NOT derived from booking ids.
// 128 bits of entropy → room names are practically unguessable and unrelated
// to booking ids (the old `wishubest-<last8>` pattern was enumerable from
// booking ids; this replaces it for NEW bookings).
// ============================================================================

/** `wishubest-` + 32 hex chars (128 bits of CSPRNG entropy). */
export function generateSecureRoomName(): string {
  return `wishubest-${crypto.randomBytes(16).toString('hex')}`
}
