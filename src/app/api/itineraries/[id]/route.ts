import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/itineraries/[id]
 *
 * Fetch a specific itinerary by ID. Only the owner (patient) or an admin
 * can view it. Includes all items and linked bookings.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT' && session.role !== 'ADMIN') return error(403, 'Patients only')

    const { id } = await params

    const itinerary = await db.itinerary.findUnique({
      where: { id },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        bookings: {
          select: {
            id: true,
            status: true,
            providerType: true,
            startDate: true,
            amount: true,
            doctorId: true,
            hospitalId: true,
            hotelId: true,
            translatorId: true,
          },
        },
      },
    })

    if (!itinerary) return error(404, 'Itinerary not found')

    // Ownership check — only the patient owner or admin can view
    const isOwner = itinerary.patientId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isOwner && !isAdmin) return error(403, 'Forbidden')

    return json({ itinerary })
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/itineraries/[id]
 *
 * Delete a DRAFT itinerary. Only the owner can delete, and only if
 * the status is DRAFT (booked itineraries cannot be deleted).
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const { id } = await params

    const itinerary = await db.itinerary.findUnique({ where: { id } })
    if (!itinerary) return error(404, 'Itinerary not found')
    if (itinerary.patientId !== session.id) return error(403, 'Forbidden')
    if (itinerary.status !== 'DRAFT') return error(409, 'Only draft itineraries can be deleted')

    await db.itinerary.delete({ where: { id } })

    return json({ ok: true })
  } catch (e) { return handleError(e) }
}
