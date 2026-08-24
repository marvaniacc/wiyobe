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
    if (countryId) {
      const cities = await db.city.findMany({ where: { countryId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, countryId: true } })
      return json({ cities })
    }
    const countries = await db.country.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, isoCode: true, slug: true, flag: true, cities: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } } } })
    return json({ countries })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({ name: z.string().min(1), isoCode: z.string().min(2).max(2), flag: z.string().optional() })

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, createSchema)
    const slug = slugify(body.name)
    const country = await db.country.create({ data: { name: body.name, isoCode: body.isoCode.toUpperCase(), slug, flag: body.flag || null, isActive: true } })
    return json({ country }, 201)
  } catch (e) { return handleError(e) }
}
