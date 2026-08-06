import { db } from '@/lib/db'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Get available (unbooked, future) slots for a provider.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const doctorId = searchParams.get('doctorId')
    const hospitalId = searchParams.get('hospitalId')
    const translatorId = searchParams.get('translatorId')

    const where: any = { isBooked: false, startTime: { gte: new Date() } }
    if (doctorId) where.doctorId = doctorId
    if (hospitalId) where.hospitalId = hospitalId
    if (translatorId) where.translatorId = translatorId
    if (!doctorId && !hospitalId && !translatorId) return error(400, 'provider id required')

    const slots = await db.slot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      take: 60,
    })
    return json({ slots })
  } catch (e) { return handleError(e) }
}
