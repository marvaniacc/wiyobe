import { db } from '@/lib/db'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type') as 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
    if (!id || !type) return error(400, 'id and type required')

    let provider: any = null
    if (type === 'DOCTOR') {
      provider = await db.doctor.findUnique({
        where: { id },
        include: { user: { select: { name: true, email: true, avatarUrl: true, phone: true } }, services: true },
      })
    } else if (type === 'HOSPITAL') {
      provider = await db.hospital.findUnique({
        where: { id },
        include: { user: { select: { name: true, email: true, avatarUrl: true, phone: true } }, services: true },
      })
    } else if (type === 'HOTEL') {
      provider = await db.hotel.findUnique({
        where: { id },
        include: { user: { select: { name: true, email: true, avatarUrl: true, phone: true } }, services: true },
      })
    } else if (type === 'TRANSLATOR') {
      provider = await db.translator.findUnique({
        where: { id },
        include: { user: { select: { name: true, email: true, avatarUrl: true, phone: true } }, services: true },
      })
    }
    if (!provider) return error(404, 'Provider not found')

    const reviews = await db.review.findMany({
      where: { subjectUserId: provider.userId },
      include: { author: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return json({ provider, reviews })
  } catch (e) { return handleError(e) }
}
