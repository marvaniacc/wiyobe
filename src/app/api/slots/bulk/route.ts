import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  // Create multiple slots at once for recurring availability
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),   // YYYY-MM-DD (inclusive)
  daysOfWeek: z.array(z.number().int().min(0).max(6)), // 0=Sun ... 6=Sat
  startTime: z.string(), // HH:mm
  endTime: z.string(),   // HH:mm
  visitType: z.enum(['IN_PERSON', 'ONLINE']).default('IN_PERSON'),
  slotDurationMinutes: z.number().int().min(15).max(480).default(60),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, schema)

    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, translator: true } })
    let providerField: any = {}
    if (u?.doctor) providerField = { doctorId: u.doctor.id }
    else if (u?.hospital) providerField = { hospitalId: u.hospital.id }
    else if (u?.translator) providerField = { translatorId: u.translator.id }
    else return error(403, 'Not a slot-creating provider')

    const start = new Date(body.startDate + 'T00:00:00')
    const end = new Date(body.endDate + 'T23:59:59')
    if (end < start) return error(400, 'End date must be after start date')

    const [startH, startM] = body.startTime.split(':').map(Number)
    const [endH, endM] = body.endTime.split(':').map(Number)

    const slotsToCreate: any[] = []
    const current = new Date(start)

    while (current <= end) {
      const dow = current.getDay()
      if (body.daysOfWeek.includes(dow)) {
        // Generate slots from startTime to endTime with slotDurationMinutes
        let slotStart = new Date(current)
        slotStart.setHours(startH, startM, 0, 0)
        const dayEnd = new Date(current)
        dayEnd.setHours(endH, endM, 0, 0)

        while (slotStart < dayEnd) {
          const slotEnd = new Date(slotStart.getTime() + body.slotDurationMinutes * 60000)
          if (slotEnd > dayEnd) break
          slotsToCreate.push({
            ...providerField,
            startTime: new Date(slotStart),
            endTime: new Date(slotEnd),
            visitType: body.visitType,
          })
          slotStart = slotEnd
        }
      }
      current.setDate(current.getDate() + 1)
    }

    if (slotsToCreate.length === 0) {
      return error(400, 'No slots generated for the selected criteria.')
    }
    if (slotsToCreate.length > 200) {
      return error(400, 'Too many slots (max 200). Reduce the date range or increase duration.')
    }

    const result = await db.slot.createMany({ data: slotsToCreate })
    return json({ created: result.count, slots: slotsToCreate.length }, 201)
  } catch (e) { return handleError(e) }
}
