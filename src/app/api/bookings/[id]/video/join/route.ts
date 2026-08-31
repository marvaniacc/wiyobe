import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { authorizeBookingChat } from '@/lib/chat-auth'
import { NextResponse } from 'next/server'
import {
  isVideoTokenConfigured,
  issueVideoJoinToken,
  verifyVideoJoinToken,
  VIDEO_TOKEN_TTL_SECONDS,
} from '@/lib/video-token'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bookings/[id]/video/join?token=<optional>
 *
 * Server-gated video-room access (Jitsi privacy Option B):
 *
 *   • Without a token: verifies the requester is the booking's patient,
 *     provider, or an admin (same authorization as booking chat via
 *     authorizeBookingChat), then issues a short-lived HMAC join token
 *     (VIDEO_TOKEN_TTL_SECONDS, signed with AUTH_SECRET, bound to the
 *     booking id) and returns the room URL + token + expiry. The room URL
 *     is therefore never served by this API to anyone who is not on the
 *     booking, and every served link is time-boxed.
 *
 *   • With a token (?token=…): verifies signature, expiry, and booking
 *     binding, re-checks session authorization (defense in depth), then
 *     returns the same payload with a fresh token.
 *
 * Authorization: 401 unauthenticated, 403 not a participant / invalid token,
 * 404 unknown booking or booking has no video room. If AUTH_SECRET is
 * missing the route fails closed with 503. MAC comparison is constant-time.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (!isVideoTokenConfigured()) {
      return error(503, 'Video join is temporarily unavailable — server signing key missing')
    }

    const { id: bookingId } = await params

    // Token present → verify it BEFORE any booking lookup (cheap rejection).
    const token = new URL(req.url).searchParams.get('token')
    if (token) {
      const v = verifyVideoJoinToken(token)
      if (!v.ok && v.reason === 'expired') {
        return error(401, 'Video link expired — please request a fresh link')
      }
      if (!v.ok) return error(403, 'Invalid video link')
      if (v.bookingId !== bookingId) return error(403, 'Video link is not valid for this booking')
    }

    // Session-based authorization (patient / provider / admin on THIS booking).
    const auth = await authorizeBookingChat(bookingId, session)
    if (!auth) return error(403, 'Forbidden')

    if (!auth.booking.videoSessionUrl) {
      return error(404, 'This booking has no video room')
    }

    const { token: joinToken, expiresAt } = issueVideoJoinToken(bookingId)

    // redirect=1 → browser-friendly mode: the dashboard <a href> points here
    // (so the raw room URL never appears in any page payload); after the same
    // authorization checks we 302 straight into the Jitsi room. In this mode
    // the join token is still issued (and logged as issued) but the browser
    // is redirected directly — public Jitsi cannot consume the token.
    if (new URL(req.url).searchParams.get('redirect') === '1') {
      return NextResponse.redirect(auth.booking.videoSessionUrl, 302)
    }

    return json({
      bookingId,
      url: auth.booking.videoSessionUrl,
      joinToken,
      tokenExpiresAt: expiresAt.toISOString(),
      tokenTtlSeconds: VIDEO_TOKEN_TTL_SECONDS,
    })
  } catch (e) {
    return handleError(e)
  }
}
