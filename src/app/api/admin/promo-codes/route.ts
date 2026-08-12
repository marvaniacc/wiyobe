import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/promo-codes
 *
 * Admin only. Returns all promo codes ordered by creation date (newest first).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const codes = await db.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { bookings: true } } },
    })
    return json({ promoCodes: codes })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  code: z.string().min(3).max(30).transform((v) => v.toUpperCase().trim()),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
})

/**
 * POST /api/admin/promo-codes
 *
 * Admin only. Creates a new promo code. The code is normalized to uppercase
 * and checked for uniqueness.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const body = await parseBody(req, createSchema)

    // Validate discountValue bounds
    if (body.discountType === 'PERCENTAGE' && body.discountValue > 100) {
      return error(400, 'Percentage discount cannot exceed 100')
    }

    // Check code uniqueness
    const existing = await db.promoCode.findUnique({ where: { code: body.code } })
    if (existing) return error(409, 'A promo code with this code already exists')

    const promo = await db.promoCode.create({
      data: {
        code: body.code,
        discountType: body.discountType,
        discountValue: body.discountValue,
        maxUses: body.maxUses ?? null,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        isActive: body.isActive,
      },
    })
    return json({ promoCode: promo }, 201)
  } catch (e) { return handleError(e) }
}

const patchSchema = z.object({
  id: z.string(),
  isActive: z.boolean().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  discountValue: z.number().int().positive().optional(),
})

/**
 * PATCH /api/admin/promo-codes
 *
 * Admin only. Updates a promo code's active status, max uses, expiry, or
 * discount value. The code itself cannot be changed (it would break
 * references on existing bookings).
 */
export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const body = await parseBody(req, patchSchema)
    const { id, ...updates } = body

    const existing = await db.promoCode.findUnique({ where: { id } })
    if (!existing) return error(404, 'Promo code not found')

    if (updates.discountValue !== undefined && existing.discountType === 'PERCENTAGE' && updates.discountValue > 100) {
      return error(400, 'Percentage discount cannot exceed 100')
    }

    const updated = await db.promoCode.update({
      where: { id },
      data: {
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
        ...(updates.maxUses !== undefined ? { maxUses: updates.maxUses } : {}),
        ...(updates.expiryDate !== undefined ? { expiryDate: updates.expiryDate ? new Date(updates.expiryDate) : null } : {}),
        ...(updates.discountValue !== undefined ? { discountValue: updates.discountValue } : {}),
      },
    })
    return json({ promoCode: updated })
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/admin/promo-codes?id=xxx
 *
 * Admin only. Deletes a promo code that has never been used. Codes that
 * have been used (usedCount > 0 or bookings exist) cannot be deleted —
 * deactivate them instead to preserve financial audit history.
 */
export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')

    const existing = await db.promoCode.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    })
    if (!existing) return error(404, 'Promo code not found')

    if (existing.usedCount > 0 || existing._count.bookings > 0) {
      return error(409, 'Cannot delete a promo code that has been used. Deactivate it instead.')
    }

    await db.promoCode.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
