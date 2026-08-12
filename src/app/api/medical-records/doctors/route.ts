import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/medical-records/doctors
 *
 * Patients only. Returns the distinct list of doctors the patient has had
 * at least one booking with (any status), so the patient can select from
 * them when granting medical-record access. This deliberately restricts
 * the access-grant pool to doctors the patient has a real care
 * relationship with — a patient cannot grant access to an arbitrary
 * doctor they have never booked.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Patients only')

    const bookings = await db.booking.findMany({
      where: { patientId: session.id, doctorId: { not: null } },
      select: {
        doctor: {
          select: {
            id: true,
            specialty: true,
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
      distinct: ['doctorId'],
    })

    const doctors = bookings
      .map((b) => b.doctor)
      .filter(Boolean)
      .map((d) => ({
        id: d!.user.id,
        name: d!.user.name,
        email: d!.user.email,
        avatarUrl: d!.user.avatarUrl,
        specialty: d!.specialty,
      }))

    return json({ doctors })
  } catch (e) { return handleError(e) }
}
