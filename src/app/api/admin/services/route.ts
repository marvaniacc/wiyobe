import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * Admin Service-modality classification workflow (Migration Plan v3 —
 * Decision 4 follow-up). This is the "controlled classification workflow"
 * the codebase comments referred to: humans classify each Service through
 * this UI/API; there is deliberately NO batch inference from Booking.visitType
 * or any other heuristic.
 *
 * GET   /api/admin/services  — all Services (any provider type) with owner
 *                              name, filterable by modality/isActive/
 *                              providerType, sortable.
 * PATCH /api/admin/services  — set modality on an existing Service.
 *
 * One-way rule: modality can only be SET to a real enum value, never cleared
 * back to NULL through this API (matches the provider PATCH contract from
 * the modality UI groundwork — no silent assignment, no un-classify).
 */

function requireAdmin(session: { role: string } | null) {
  if (!session || session.role !== 'ADMIN') return false
  return true
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!requireAdmin(session)) return error(403, 'Admin only')

    const { searchParams } = new URL(req.url)

    // Filters
    const where: any = {}
    const modality = searchParams.get('modality')
    if (modality === 'UNCLASSIFIED') {
      where.modality = null
    } else if (modality === 'CHAT' || modality === 'VIDEO' || modality === 'IN_PERSON') {
      where.modality = modality
    } else if (modality) {
      return error(400, 'Invalid modality filter')
    }
    const isActive = searchParams.get('isActive')
    if (isActive === 'true') where.isActive = true
    else if (isActive === 'false') where.isActive = false
    const providerType = searchParams.get('providerType')
    if (providerType && ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'].includes(providerType)) {
      where.providerType = providerType
    }

    // Sorting (whitelisted fields only)
    const sortBy = searchParams.get('sortBy')
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
    const sortable: Record<string, object> = {
      createdAt: { createdAt: sortDir },
      name: { name: sortDir },
      price: { price: sortDir },
      modality: { modality: { sort: sortDir, nulls: 'first' } },
    }
    const orderBy = (sortBy && sortable[sortBy]) || sortable.createdAt

    const services = await db.service.findMany({
      where,
      orderBy,
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        hospital: { include: { user: { select: { name: true } } } },
        hotel: { include: { user: { select: { name: true } } } },
        translator: { include: { user: { select: { name: true } } } },
      },
    })
    return json({ services })
  } catch (e) { return handleError(e) }
}

const patchSchema = z.object({
  id: z.string(),
  modality: z.enum(['CHAT', 'VIDEO', 'IN_PERSON']),
})

export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!requireAdmin(session)) return error(403, 'Admin only')
    const body = await parseBody(req, patchSchema)

    const existing = await db.service.findUnique({
      where: { id: body.id },
      select: { id: true, modality: true },
    })
    if (!existing) return error(404, 'Service not found')

    // One-way classification: accept only real enum values (schema enforces
    // this — there is no NULL option in this API), so a classified Service
    // can be re-labeled but can never be reset to the legacy NULL state.
    const service = await db.service.update({
      where: { id: body.id },
      data: { modality: body.modality },
    })
    return json({ service })
  } catch (e) { return handleError(e) }
}
