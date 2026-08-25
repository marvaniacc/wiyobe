import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { verifyTurnstileToken, markTurnstilePassed, hasTurnstilePassed } from '@/lib/turnstile'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const OTP_TTL_MINUTES = 10
const RESEND_COOLDOWN_SEC = 45

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(['signup', 'signin', 'reset']),
  // Anti-bot token — required for signup (account creation happens after verify)
  cfToken: z.string().optional(),
  // For signup OTP, we stash the full signup payload to use after verification
  signupData: z.object({
    role: z.enum(['PATIENT', 'DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR', 'AFFILIATE']),
    name: z.string().min(2),
    password: z.string().min(6),
    preferredLanguage: z.enum(['en', 'tr', 'fa', 'ar', 'ru']).default('en'),
    phone: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    specialty: z.string().optional(),
    languages: z.string().optional(),
    referralCode: z.string().optional(),
  }).optional(),
})

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)

    // Anti-abuse: per-IP and per-account budgets (email bombing / spam guard).
    const ip = clientIp(req)
    const emailKey = body.email.toLowerCase()
    const perIp = rateLimit(`otpsend:ip:${ip}`, 10, 15 * 60 * 1000)
    const perEmail = rateLimit(`otpsend:acct:${emailKey}`, 5, 15 * 60 * 1000)
    if (!perIp.ok || !perEmail.ok) {
      const wait = Math.max(perIp.retryAfterSec, perEmail.retryAfterSec)
      return error(429, `Too many code requests. Please try again in ${Math.ceil(wait / 60)} minute${Math.ceil(wait / 60) === 1 ? '' : 's'}.`)
    }

    // For signup: ensure email isn't already taken + enforce Turnstile
    // (account creation moved to the OTP flow, so the anti-bot check moved too)
    if (body.purpose === 'signup') {
      const existing = await db.user.findUnique({ where: { email: body.email } })
      if (existing) return error(409, 'An account with this email already exists.')
      if (!body.signupData) return error(400, 'signupData required for signup OTP')
      // A Turnstile token is single-use: require it only on the FIRST send.
      // Resends within the TTL reuse the earlier pass (otherwise every resend
      // would fail with 'Security verification failed').
      if (hasTurnstilePassed(body.email)) {
        markTurnstilePassed(body.email) // sliding window
      } else {
        const turnstileOk = await verifyTurnstileToken(body.cfToken)
        if (!turnstileOk) return error(403, 'Security verification failed. Please try again.')
        markTurnstilePassed(body.email)
      }
    }

    // For signin/reset: ensure user exists
    if (body.purpose === 'signin' || body.purpose === 'reset') {
      const user = await db.user.findUnique({ where: { email: body.email } })
      // Anti-enumeration: respond exactly like a successful send for unknown
      // accounts (no code is created, nothing is emailed).
      if (!user) {
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
        return json({ sent: true, expiresAt: expiresAt.toISOString() })
      }
      if (user.status === 'SUSPENDED') return error(403, 'Your account has been suspended.')
    }

    // Cooldown: prevent spamming — check for a recent unused code
    const recent = await db.otpCode.findFirst({
      where: { email: body.email, used: false, createdAt: { gte: new Date(Date.now() - RESEND_COOLDOWN_SEC * 1000) } },
      orderBy: { createdAt: 'desc' },
    })
    if (recent) {
      const wait = Math.ceil((RESEND_COOLDOWN_SEC * 1000 - (Date.now() - recent.createdAt.getTime())) / 1000)
      return error(429, `Please wait ${wait}s before requesting a new code.`)
    }

    // Generate 6-digit code
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

    // Invalidate previous unused codes for this email+purpose
    await db.otpCode.updateMany({
      where: { email: body.email, purpose: body.purpose, used: false },
      data: { used: true },
    })

    await db.otpCode.create({
      data: {
        email: body.email,
        code,
        purpose: body.purpose,
        // SECURITY: the stashed signup payload must NEVER contain the
        // plaintext password — store its scrypt hash and use it directly
        // as passwordHash when the user is created after verification.
        payload: body.signupData
          ? JSON.stringify({ ...body.signupData, password: hashPassword(body.signupData.password) })
          : null,
        expiresAt,
      },
    })

    // Opportunistic cleanup: purge consumed and expired codes (they may hold
    // sensitive stashed payloads) so nothing lingers in the table.
    await db.otpCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    })

    // Send email — uses SMTP if configured. In production a missing SMTP
    // configuration must FAIL CLOSED: returning the code in the response
    // (or logging it) would allow unauthenticated account takeover.
    const isProd = process.env.NODE_ENV === 'production'
    if (!process.env.SMTP_HOST) {
      if (isProd) {
        console.error(`[auth/otp] SMTP_HOST is not configured — refusing to issue OTP for ${body.email}`)
        return error(503, 'Email delivery is temporarily unavailable. Please contact support.')
      }
      console.log(`\n🔐 OTP for ${body.email} (${body.purpose}): ${code}\n   Expires at ${expiresAt.toISOString()}\n`)
    } else {
      const { sendEmail, otpEmailTemplate } = await import('@/lib/email')
      const template = otpEmailTemplate(code, body.purpose)
      const delivered = await sendEmail({ to: body.email, subject: template.subject, html: template.html })
      // Do not claim success when delivery failed — the user would wait for a
      // code that never arrives.
      if (!delivered) {
        return error(502, 'Failed to send the email. Please try again in a few minutes.')
      }
    }

    // devCode is returned ONLY outside production (and only when SMTP is unset)
    return json({
      sent: true,
      expiresAt: expiresAt.toISOString(),
      ...(!isProd && !process.env.SMTP_HOST ? { devCode: code } : {}),
    })
  } catch (e) { return handleError(e) }
}
