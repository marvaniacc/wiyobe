import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { VISIT_TYPE_ZOD_ENUM, normalizeVisitType } from '@/lib/modality'
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
  // Accepts legacy ONLINE (persisted as VIDEO per central modality mapping).
  visitType: z.enum(VISIT_TYPE_ZOD_ENUM).default('IN_PERSON'),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, createSchema)
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, translator: true } })
    // Normalize once through the central module: ONLINE -> VIDEO on write.
    // Historical rows are never rewritten; only new writes are canonicalized.
    let visitType: 'VIDEO' | 'CHAT' | 'IN_PERSON'
    try {
      visitType = normalizeVisitType(body.visitType) as 'VIDEO' | 'CHAT' | 'IN_PERSON'
    } catch {
      return error(400, `Unknown visit type: ${body.visitType}`)
    }
    const data: any = { startTime: new Date(body.startTime), endTime: new Date(body.endTime), visitType }

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

    // Ownership check: verify the slot belongs to the authenticated provider
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, translator: true } })
    const ownershipWhere: any = { id }
    if (u?.doctor) ownershipWhere.doctorId = u.doctor.id
    else if (u?.hospital) ownershipWhere.hospitalId = u.hospital.id
    else if (u?.translator) ownershipWhere.translatorId = u.translator.id
    else return error(403, 'Not a provider')

    const existing = await db.slot.findFirst({ where: ownershipWhere, select: { id: true } })
    if (!existing) return error(403, 'You do not own this slot')

    await db.slot.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
