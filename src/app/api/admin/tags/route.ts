import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-')
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const tags = await db.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    })
    return json({ tags })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({ name: z.string().min(1).max(50) })

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, createSchema)
    const slug = slugify(body.name)
    const existing = await db.tag.findUnique({ where: { name: body.name } })
    if (existing) return error(409, 'A tag with this name already exists')
    const tag = await db.tag.create({ data: { name: body.name, slug } })
    return json({ tag }, 201)
  } catch (e) { return handleError(e) }
}
