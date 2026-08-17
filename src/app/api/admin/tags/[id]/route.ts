import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const { id } = await params
    await db.tag.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
