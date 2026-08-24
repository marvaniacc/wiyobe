import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-')
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const url = new URL(req.url)
    const countryId = url.searchParams.get('countryId')
    const cities = await db.city.findMany({ where: countryId ? { countryId } : {}, orderBy: { name: 'asc' } })
    return json({ cities })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({ name: z.string().min(1), countryId: z.string() })

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, createSchema)
    const slug = slugify(body.name)
    const city = await db.city.create({ data: { name: body.name, slug, countryId: body.countryId, isActive: true } })
    return json({ city }, 201)
  } catch (e) { return handleError(e) }
}
