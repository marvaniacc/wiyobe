import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/kyc-requirements
 *
 * Admin only. Returns all KYC requirements, optionally filtered by
 * `?providerType=DOCTOR`. Ordered by `order` then `createdAt`.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { searchParams } = new URL(req.url)
    const providerType = searchParams.get('providerType')

    const where = providerType ? { providerType } : {}

    const requirements = await db.kycRequirement.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { documents: true } },
      },
    })
    return json({ requirements })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
  documentName: z.string().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
  isRequired: z.boolean().default(true),
  order: z.number().int().default(0),
})

/**
 * POST /api/admin/kyc-requirements
 *
 * Admin only. Creates a new KYC requirement.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const body = await parseBody(req, createSchema)

    const requirement = await db.kycRequirement.create({
      data: {
        providerType: body.providerType,
        documentName: body.documentName,
        description: body.description ?? null,
        isRequired: body.isRequired,
        order: body.order,
      },
    })
    return json({ requirement }, 201)
  } catch (e) { return handleError(e) }
}
