import { db } from '@/lib/db'
import { getSession, invalidateSessions } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const users = await db.user.findMany({
      include: { doctor: true, hospital: true, hotel: true, translator: true, patient: true },
      orderBy: { createdAt: 'desc' },
    })
    // Strip credential material from every row before sending.
    const safeUsers = users.map((u) => {
      const { passwordHash: _ph, googleId: _gi, sessionsInvalidAfter: _si, ...rest } = u
      void _ph; void _gi; void _si
      return rest
    })
    return json({ users: safeUsers })
  } catch (e) { return handleError(e) }
}

const schema = z.object({
  userId: z.string(),
  action: z.enum(['approve', 'suspend', 'activate', 'reject']),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, schema)

    const user = await db.user.findUnique({ where: { id: body.userId }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
    if (!user) return error(404, 'User not found')

    let status = user.status
    let verified = false
    if (body.action === 'approve') { status = 'ACTIVE'; verified = true }
    else if (body.action === 'activate') { status = 'ACTIVE' }
    else if (body.action === 'suspend') { status = 'SUSPENDED' }
    else if (body.action === 'reject') { status = 'SUSPENDED' }

    await db.user.update({ where: { id: user.id }, data: { status: status as any } })
    // Suspension/rejection must also revoke the user's existing sessions.
    if (body.action === 'suspend' || body.action === 'reject') {
      await invalidateSessions(user.id)
    }
    // Re-approval clears the revocation marker so future suspensions start clean.
    if (body.action === 'activate' || body.action === 'approve') {
      await db.user.update({ where: { id: user.id }, data: { sessionsInvalidAfter: null } })
    }

    if (verified) {
      if (user.doctor) await db.doctor.update({ where: { id: user.doctor.id }, data: { verified: true } })
      if (user.hospital) await db.hospital.update({ where: { id: user.hospital.id }, data: { verified: true } })
      if (user.hotel) await db.hotel.update({ where: { id: user.hotel.id }, data: { verified: true } })
      if (user.translator) await db.translator.update({ where: { id: user.translator.id }, data: { verified: true } })
    }

    return json({ ok: true, status })
  } catch (e) { return handleError(e) }
}
