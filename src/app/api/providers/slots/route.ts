import { db } from '@/lib/db'
import { json, error, handleError } from '@/lib/api'
import { VISIT_TYPE_ZOD_ENUM, slotFilterForModality, normalizeVisitType } from '@/lib/modality'
import { expirePaymentHolds } from '@/lib/payment-holds'

export const dynamic = 'force-dynamic'

// Get available (unbooked, future) slots for a provider.
//
// Optional `visitType` filter accepts product-level modalities
// (VIDEO | CHAT | IN_PERSON). Historical ONLINE slots are the database
// representation of VIDEO, so ?visitType=VIDEO returns both VIDEO and ONLINE
// rows via the central modality module (`slotFilterForModality`). Legacy
// `?visitType=ONLINE` input is also accepted and normalized to VIDEO.
// No visitType param = all modalities (unchanged legacy behavior).
export async function GET(req: Request) {
  try {
    // Opportunistic cleanup keeps inventory accurate even if a scheduled job
    // is delayed or unavailable.
    await expirePaymentHolds()
    const { searchParams } = new URL(req.url)
    const doctorId = searchParams.get('doctorId')
    const hospitalId = searchParams.get('hospitalId')
    const translatorId = searchParams.get('translatorId')
    const rawVisitType = searchParams.get('visitType')

    const where: any = { isBooked: false, startTime: { gte: new Date() } }
    if (doctorId) where.doctorId = doctorId
    if (hospitalId) where.hospitalId = hospitalId
    if (translatorId) where.translatorId = translatorId

    if (rawVisitType && !(VISIT_TYPE_ZOD_ENUM as readonly string[]).includes(rawVisitType)) {
      return error(400, `Unknown visit type: ${rawVisitType}`)
    }
    if (rawVisitType) {
      where.visitType = { in: slotFilterForModality(normalizeVisitType(rawVisitType)) }
    }

    if (!doctorId && !hospitalId && !translatorId) return error(400, 'provider id required')

    const slots = await db.slot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      take: 60,
    })
    return json({ slots })
  } catch (e) { return handleError(e) }
}
