import { db } from '@/lib/db'
import { json, error, handleError, parseBody } from '@/lib/api'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { hashOtpCode, encryptPayload } from '@/lib/crypto'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const OTP_TTL_MINUTES = 10
const RESEND_COOLDOWN_SEC = 45

// Per-IP + per-email send limits (anti-spam)
const IP_MAX_SENDS = 10
const IP_WINDOW_MS = 60 * 60 * 1000
const EMAIL_MAX_SENDS = 5
const EMAIL_WINDOW_MS = 60 * 60 * 1000

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(['signup', 'signin', 'reset']),
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

    // Rate limiting — per IP and per email
    const ip = clientIp(req)
    const ipCheck = rateLimit(`otp-send:ip:${ip}`, IP_MAX_SENDS, IP_WINDOW_MS)
    if (!ipCheck.allowed) return error(429, 'Too many requests. Please try again later.')
    const emailKey = body.email.toLowerCase()
    const emailCheck = rateLimit(`otp-send:email:${emailKey}`, EMAIL_MAX_SENDS, EMAIL_WINDOW_MS)
    if (!emailCheck.allowed) return error(429, `Too many requests for this email. Try again in ${emailCheck.retryAfterSec}s.`)

    // For signup: ensure email isn't already taken
    if (body.purpose === 'signup') {
      const existing = await db.user.findUnique({ where: { emailLower: body.email.toLowerCase() } })
      if (existing) return error(409, 'An account with this email already exists.')
      if (!body.signupData) return error(400, 'signupData required for signup OTP')
    }

    // For signin/reset: ensure user exists
    if (body.purpose === 'signin' || body.purpose === 'reset') {
      const user = await db.user.findUnique({ where: { emailLower: body.email.toLowerCase() } })
      if (!user) return error(404, 'No account found with this email.')
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

    // Never store plaintext: the code is HMAC-hashed and the signup payload is
    // AES-256-GCM encrypted before it touches the DB.
    const codeHash = hashOtpCode(code)
    const payload = body.signupData ? encryptPayload(JSON.stringify(body.signupData)) : null

    await db.otpCode.create({
      data: {
        email: body.email,
        code: codeHash,
        purpose: body.purpose,
        payload,
        expiresAt,
      },
    })

    // Send email — uses SMTP if configured, otherwise logs to console (dev mode)
    const isDev = !process.env.SMTP_HOST
    if (isDev) {
      console.log(`\n🔐 OTP for ${body.email} (${body.purpose}): ${code}\n   Expires at ${expiresAt.toISOString()}\n`)
    } else {
      const { sendEmail, otpEmailTemplate } = await import('@/lib/email')
      const template = otpEmailTemplate(code, body.purpose)
      await sendEmail({ to: body.email, subject: template.subject, html: template.html })
    }

    // Only return devCode in development mode (no SMTP configured)
    return json({
      sent: true,
      expiresAt: expiresAt.toISOString(),
      ...(isDev ? { devCode: code } : {}),
    })
  } catch (e) { return handleError(e) }
}
