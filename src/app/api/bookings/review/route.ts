import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  bookingId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(3),
  language: z.enum(['en', 'tr', 'fa', 'ar']).default('en'),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, schema)

    const booking = await db.booking.findUnique({ where: { id: body.bookingId } })
    if (!booking) return error(404, 'Booking not found')
    if (booking.patientId !== session.id) return error(403, 'Only the patient can review')
    if (booking.status !== 'COMPLETED') return error(409, 'Can only review completed bookings')

    const existing = await db.review.findUnique({ where: { bookingId: booking.id } })
    if (existing) return error(409, 'Review already exists')

    // resolve provider user id
    const { resolveProviderUser } = await import('@/lib/ledger')
    const subjectUserId = await resolveProviderUser(booking)
    if (!subjectUserId) return error(400, 'Provider not found')

    const review = await db.review.create({
      data: {
        authorId: session.id,
        subjectUserId,
        bookingId: booking.id,
        rating: body.rating,
        comment: body.comment,
        language: body.language,
      },
    })

    // update provider's aggregate rating
    const agg = await db.review.aggregate({ where: { subjectUserId }, _avg: { rating: true }, _count: true })
    const userId = subjectUserId
    const providerUser = await db.user.findUnique({ where: { id: userId }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
    const newRating = agg._avg.rating || 0
    const newCount = agg._count
    if (providerUser?.doctor) await db.doctor.update({ where: { id: providerUser.doctor.id }, data: { rating: newRating, reviewCount: newCount } })
    if (providerUser?.hospital) await db.hospital.update({ where: { id: providerUser.hospital.id }, data: { rating: newRating, reviewCount: newCount } })
    if (providerUser?.hotel) await db.hotel.update({ where: { id: providerUser.hotel.id }, data: { rating: newRating, reviewCount: newCount } })
    if (providerUser?.translator) await db.translator.update({ where: { id: providerUser.translator.id }, data: { rating: newRating, reviewCount: newCount } })

    return json({ review }, 201)
  } catch (e) { return handleError(e) }
}
