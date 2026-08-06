import { db } from '@/lib/db'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const OTP_TTL_MINUTES = 10
const RESEND_COOLDOWN_SEC = 45

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(['signup', 'signin', 'reset']),
  // For signup OTP, we stash the full signup payload to use after verification
  signupData: z.object({
    role: z.enum(['PATIENT', 'DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR', 'AFFILIATE']),
    name: z.string().min(2),
    password: z.string().min(6),
    preferredLanguage: z.enum(['en', 'tr', 'fa', 'ar']).default('en'),
    phone: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    specialty: z.string().optional(),
    languages: z.string().optional(),
  }).optional(),
})

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)

    // For signup: ensure email isn't already taken
    if (body.purpose === 'signup') {
      const existing = await db.user.findUnique({ where: { email: body.email } })
      if (existing) return error(409, 'An account with this email already exists.')
      if (!body.signupData) return error(400, 'signupData required for signup OTP')
    }

    // For signin/reset: ensure user exists
    if (body.purpose === 'signin' || body.purpose === 'reset') {
      const user = await db.user.findUnique({ where: { email: body.email } })
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

    await db.otpCode.create({
      data: {
        email: body.email,
        code,
        purpose: body.purpose,
        payload: body.signupData ? JSON.stringify(body.signupData) : null,
        expiresAt,
      },
    })

    // Send email — in production this calls an email service. In dev, log it.
    console.log(`\n🔐 OTP for ${body.email} (${body.purpose}): ${code}\n   Expires at ${expiresAt.toISOString()}\n`)

    // In dev mode, return the code so the UI can display it (demo convenience).
    const isDev = !process.env.SMTP_HOST
    return json({
      sent: true,
      expiresAt: expiresAt.toISOString(),
      ...(isDev ? { devCode: code } : {}),
    })
  } catch (e) { return handleError(e) }
}
