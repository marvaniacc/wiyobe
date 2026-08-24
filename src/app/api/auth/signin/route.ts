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

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)

    // Brute-force protection: per-account+IP and per-IP budgets.
    const ip = clientIp(req)
    const emailKey = body.email.toLowerCase()
    const perAccount = rateLimit(`signin:acct:${ip}:${emailKey}`, 10, 15 * 60 * 1000)
    const perIp = rateLimit(`signin:ip:${ip}`, 30, 15 * 60 * 1000)
    if (!perAccount.ok || !perIp.ok) {
      const wait = Math.max(perAccount.retryAfterSec, perIp.retryAfterSec)
      return error(429, `Too many attempts. Please try again in ${Math.ceil(wait / 60)} minute${Math.ceil(wait / 60) === 1 ? '' : 's'}.`)
    }

    const user = await db.user.findUnique({ where: { email: body.email } })
    if (!user) return error(401, 'Invalid email or password.')
    // Generic message — revealing "this account uses Google" leaks account existence.
    if (!user.passwordHash) {
      return error(401, 'Invalid email or password.')
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
