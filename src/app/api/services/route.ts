import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
    let where: any = {}
    if (u?.doctor) where = { OR: [{ doctorId: u.doctor.id }, { providerType: 'DOCTOR' }] }
    else if (u?.hospital) where = { OR: [{ hospitalId: u.hospital.id }, { providerType: 'HOSPITAL' }] }
    else if (u?.hotel) where = { OR: [{ hotelId: u.hotel.id }, { providerType: 'HOTEL' }] }
    else if (u?.translator) where = { OR: [{ translatorId: u.translator.id }, { providerType: 'TRANSLATOR' }] }
    else return json({ services: [] })

    // narrow to this provider's services
    const filter: any = {}
    if (u?.doctor) filter.doctorId = u.doctor.id
    if (u?.hospital) filter.hospitalId = u.hospital.id
    if (u?.hotel) filter.hotelId = u.hotel.id
    if (u?.translator) filter.translatorId = u.translator.id

    const services = await db.service.findMany({ where: filter, orderBy: { createdAt: 'desc' } })
    return json({ services })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string(),
  price: z.string(),
  currency: z.string().default('USD'),
  durationMinutes: z.number().optional(),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, createSchema)
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, hotel: true, translator: true } })

    let data: any = { name: body.name, description: body.description, price: body.price, currency: body.currency, durationMinutes: body.durationMinutes }
    if (u?.doctor) { data.providerType = 'DOCTOR'; data.doctorId = u.doctor.id }
    else if (u?.hospital) { data.providerType = 'HOSPITAL'; data.hospitalId = u.hospital.id }
    else if (u?.hotel) { data.providerType = 'HOTEL'; data.hotelId = u.hotel.id }
    else if (u?.translator) { data.providerType = 'TRANSLATOR'; data.translatorId = u.translator.id }
    else return error(403, 'Not a provider')

    const service = await db.service.create({ data })
    return json({ service }, 201)
  } catch (e) { return handleError(e) }
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.string().optional(),
  durationMinutes: z.number().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, updateSchema)
    const { id, ...rest } = body

    // Ownership check: verify the service belongs to the authenticated provider
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
    const ownershipWhere: any = { id }
    if (u?.doctor) ownershipWhere.doctorId = u.doctor.id
    else if (u?.hospital) ownershipWhere.hospitalId = u.hospital.id
    else if (u?.hotel) ownershipWhere.hotelId = u.hotel.id
    else if (u?.translator) ownershipWhere.translatorId = u.translator.id
    else return error(403, 'Not a provider')

    const existing = await db.service.findFirst({ where: ownershipWhere, select: { id: true } })
    if (!existing) return error(403, 'You do not own this service')

    const service = await db.service.update({ where: { id }, data: rest })
    return json({ service })
  } catch (e) { return handleError(e) }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return error(400, 'id required')

    // Ownership check: verify the service belongs to the authenticated provider
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
    const ownershipWhere: any = { id }
    if (u?.doctor) ownershipWhere.doctorId = u.doctor.id
    else if (u?.hospital) ownershipWhere.hospitalId = u.hospital.id
    else if (u?.hotel) ownershipWhere.hotelId = u.hotel.id
    else if (u?.translator) ownershipWhere.translatorId = u.translator.id
    else return error(403, 'Not a provider')

    const existing = await db.service.findFirst({ where: ownershipWhere, select: { id: true } })
    if (!existing) return error(403, 'You do not own this service')

    await db.service.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
