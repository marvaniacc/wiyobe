import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, translator: true } })
    const where: any = {}
    if (u?.doctor) where.doctorId = u.doctor.id
    else if (u?.hospital) where.hospitalId = u.hospital.id
    else if (u?.translator) where.translatorId = u.translator.id
    else return json({ slots: [] })
    const slots = await db.slot.findMany({ where, orderBy: { startTime: 'asc' }, take: 100 })
    return json({ slots })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  visitType: z.enum(['IN_PERSON', 'ONLINE']).default('IN_PERSON'),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, createSchema)
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, translator: true } })
    const data: any = { startTime: new Date(body.startTime), endTime: new Date(body.endTime), visitType: body.visitType }
    if (u?.doctor) data.doctorId = u.doctor.id
    else if (u?.hospital) data.hospitalId = u.hospital.id
    else if (u?.translator) data.translatorId = u.translator.id
    else return error(403, 'Not a slot-creating provider')
    const slot = await db.slot.create({ data })
    return json({ slot }, 201)
  } catch (e) { return handleError(e) }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')
    await db.slot.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
