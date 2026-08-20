import { db } from '@/lib/db'
import { verifyPassword, setSessionCookie } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const IP_MAX = 30
const IP_WINDOW_MS = 15 * 60 * 1000
const EMAIL_MAX = 8
const EMAIL_WINDOW_MS = 15 * 60 * 1000

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)

    const ipCheck = rateLimit(`signin:ip:${clientIp(req)}`, IP_MAX, IP_WINDOW_MS)
    if (!ipCheck.allowed) return error(429, 'Too many login attempts. Please try again later.')

    const emailKey = body.email.toLowerCase()
    const emailCheck = rateLimit(`signin:email:${emailKey}`, EMAIL_MAX, EMAIL_WINDOW_MS)
    if (!emailCheck.allowed) return error(429, `Too many attempts for this account. Try again in ${emailCheck.retryAfterSec}s.`)

    const user = await db.user.findUnique({ where: { emailLower: body.email.toLowerCase() } })
    if (!user) return error(401, 'Invalid email or password.')
    // Google-only accounts have no password — guide them to Google sign-in
    if (!user.passwordHash) {
      return error(401, 'This account uses Google sign-in. Please continue with Google.')
    }
    if (!verifyPassword(body.password, user.passwordHash)) {
      return error(401, 'Invalid email or password.')
    }
    if (user.status === 'SUSPENDED') return error(403, 'Your account has been suspended.')
    if (user.status === 'PENDING') return error(403, 'Your account is pending admin approval.')

    await setSessionCookie(user.id, user.role)
    return json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage, kycStatus: user.kycStatus },
    })
  } catch (e) { return handleError(e) }
}
