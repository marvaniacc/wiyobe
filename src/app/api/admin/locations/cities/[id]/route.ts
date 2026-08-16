import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { id } = await params
    const body = await parseBody(req, patchSchema)
    const updated = await db.city.update({ where: { id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) } })
    return json({ city: updated })
  } catch (e) { return handleError(e) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { id } = await params
    await db.city.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
