import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  documentName: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(['IMAGE', 'DOCUMENT', 'VIDEO']).optional(),
  isRequired: z.boolean().optional(),
  order: z.number().int().optional(),
  providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']).optional(),
})

/**
 * PATCH /api/admin/kyc-requirements/[id]
 *
 * Admin only. Updates a KYC requirement.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const body = await parseBody(req, patchSchema)

    const existing = await db.kycRequirement.findUnique({ where: { id } })
    if (!existing) return error(404, 'Requirement not found')

    const updated = await db.kycRequirement.update({
      where: { id },
      data: {
        ...(body.documentName !== undefined ? { documentName: body.documentName } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.isRequired !== undefined ? { isRequired: body.isRequired } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
        ...(body.providerType !== undefined ? { providerType: body.providerType } : {}),
      },
    })
    return json({ requirement: updated })
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/admin/kyc-requirements/[id]
 *
 * Admin only. Deletes a KYC requirement. Existing KycDocuments that
 * reference this requirement will have their `requirementId` set to null
 * (the document record is preserved for audit history).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const existing = await db.kycRequirement.findUnique({ where: { id } })
    if (!existing) return error(404, 'Requirement not found')

    // Unlink any documents that reference this requirement before deleting
    await db.kycDocument.updateMany({
      where: { requirementId: id },
      data: { requirementId: null },
    })

    await db.kycRequirement.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
