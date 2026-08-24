import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/providers/detail?id=..&type=..
 *
 * Requires authentication (used by the booking dialog). Contact details
 * (email/phone) are only included for the provider's own account or an
 * admin — public visitors use /api/providers/public instead.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type') as 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
    if (!id || !type) return error(400, 'id and type required')

    const userSelect = (includeContact: boolean) => ({
      select: {
        name: true,
        avatarUrl: true,
        ...(includeContact ? { email: true, phone: true } : {}),
      },
    })

    const isPrivileged = session.role === 'ADMIN'
    let provider: any = null
    if (type === 'DOCTOR') {
      provider = await db.doctor.findUnique({ where: { id }, include: { user: userSelect(isPrivileged), services: true } })
    } else if (type === 'HOSPITAL') {
      provider = await db.hospital.findUnique({ where: { id }, include: { user: userSelect(isPrivileged), services: true } })
    } else if (type === 'HOTEL') {
      provider = await db.hotel.findUnique({ where: { id }, include: { user: userSelect(isPrivileged), services: true } })
    } else if (type === 'TRANSLATOR') {
      provider = await db.translator.findUnique({ where: { id }, include: { user: userSelect(isPrivileged), services: true } })
    }
    if (!provider) return error(404, 'Provider not found')

    // Owner sees their own contact details too.
    if (!isPrivileged && provider.userId === session.id) {
      const full = await db.user.findUnique({
        where: { id: provider.userId },
        select: { email: true, phone: true },
      })
      provider.user = { ...provider.user, ...(full || {}) }
    }

    // Hide suspended/unverified providers from non-owners.
    const isOwner = provider.userId === session.id
    if (!isOwner && !isPrivileged && !provider.verified) return error(404, 'Provider not found')

    // Strip contact fields from non-privileged responses (defense in depth).
    if (!isPrivileged && !isOwner && provider.user) {
      delete provider.user.email
      delete provider.user.phone
    }

    const reviews = await db.review.findMany({
      where: { subjectUserId: provider.userId },
      include: { author: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return json({ provider, reviews })
  } catch (e) { return handleError(e) }
}
