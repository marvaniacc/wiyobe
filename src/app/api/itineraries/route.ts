import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * GET /api/itineraries
 *
 * Returns all itineraries for the logged-in patient, including items.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT' && session.role !== 'ADMIN') return error(403, 'Patients only')

    const where = session.role === 'ADMIN' ? {} : { patientId: session.id }

    const itineraries = await db.itinerary.findMany({
      where,
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        bookings: { select: { id: true, status: true, providerType: true, startDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return json({ itineraries })
  } catch (e) { return handleError(e) }
}

const itemSchema = z.object({
  providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
  providerId: z.string(),
  serviceId: z.string().optional(),
  estimatedCost: z.number().int().min(0),
  notes: z.string().optional(),
})

const createSchema = z.object({
  items: z.array(itemSchema).min(1, 'At least one item is required'),
  isAiGenerated: z.boolean().optional(),
})

/**
 * POST /api/itineraries
 *
 * Create a draft itinerary with one or more items.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const body = await parseBody(req, createSchema)

    // Calculate total estimated cost (in cents)
    const totalEstimatedCost = body.items.reduce((sum, item) => sum + item.estimatedCost, 0)

    const itinerary = await db.itinerary.create({
      data: {
        patientId: session.id,
        status: 'DRAFT',
        isAiGenerated: body.isAiGenerated || false,
        totalEstimatedCost,
        items: {
          create: body.items.map((item) => ({
            providerType: item.providerType,
            providerId: item.providerId,
            serviceId: item.serviceId || null,
            estimatedCost: item.estimatedCost,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true },
    })

    return json({ itinerary }, 201)
  } catch (e) { return handleError(e) }
}
