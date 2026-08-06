import { db } from '@/lib/db'
import { verifyPassword, setSessionCookie } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)
    const user = await db.user.findUnique({ where: { email: body.email } })
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
      user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage },
    })
  } catch (e) { return handleError(e) }
}
