import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  isoCode: z.string().min(2).max(2).optional(),
  flag: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { id } = await params
    const body = await parseBody(req, patchSchema)
    const updated = await db.country.update({ where: { id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.isoCode ? { isoCode: body.isoCode.toUpperCase() } : {}), ...(body.flag !== undefined ? { flag: body.flag } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) } })
    return json({ country: updated })
  } catch (e) { return handleError(e) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { id } = await params
    await db.country.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
