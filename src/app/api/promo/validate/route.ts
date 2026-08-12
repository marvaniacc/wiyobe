import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

const validateSchema = z.object({
  code: z.string().min(1).max(30).transform((v) => v.toUpperCase().trim()),
  bookingAmount: z.number().positive(),
  providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
})

/**
 * POST /api/promo/validate
 *
 * Validates a promo code for a prospective booking and returns the discount
 * amount the patient would receive. Any authenticated patient can call this.
 *
 * The discount is ALWAYS capped at the platform's commission for the given
 * provider type — the platform never subsidises a booking beyond its own
 * commission, and the provider's revenue is never reduced.
 *
 * Response: { valid, discountAmount, newTotal, originalTotal, code, discountType, discountValue }
 *
 * NOTE: This endpoint does NOT increment usedCount — that only happens when
 * the booking is actually created via POST /api/bookings.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const body = await parseBody(req, validateSchema)

    const promo = await db.promoCode.findUnique({ where: { code: body.code } })
    if (!promo) return json({ valid: false, message: 'Invalid code' })

    // Check active
    if (!promo.isActive) return json({ valid: false, message: 'This promo code is no longer active' })

    // Check expiry
    if (promo.expiryDate && new Date(promo.expiryDate) < new Date()) {
      return json({ valid: false, message: 'This promo code has expired' })
    }

    // Check usage limit
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return json({ valid: false, message: 'This promo code has reached its usage limit' })
    }

    // Calculate raw discount
    let rawDiscount: number
    if (promo.discountType === 'PERCENTAGE') {
      rawDiscount = body.bookingAmount * (promo.discountValue / 100)
    } else {
      // FIXED: discountValue is in cents
      rawDiscount = promo.discountValue / 100
    }

    // Cap at platform commission — the discount cannot exceed what the
    // platform would earn. This ensures the provider's revenue is NEVER
    // reduced and the platform never loses more than its own commission.
    const commissionRateRow = await db.commissionRate.findUnique({
      where: { providerType: body.providerType as ProviderType },
    })
    const platformRate = parseFloat(commissionRateRow?.rate || '12')
    const platformCut = body.bookingAmount * (platformRate / 100)

    const discountAmount = Math.min(rawDiscount, platformCut)
    const newTotal = body.bookingAmount - discountAmount

    return json({
      valid: true,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountAmount: discountAmount.toFixed(2),
      originalTotal: body.bookingAmount.toFixed(2),
      newTotal: newTotal.toFixed(2),
      // Whether the discount was capped (useful for UI messaging)
      capped: rawDiscount > platformCut,
      platformCut: platformCut.toFixed(2),
    })
  } catch (e) { return handleError(e) }
}
