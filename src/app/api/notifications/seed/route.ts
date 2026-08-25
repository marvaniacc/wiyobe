import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { notify } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// Seed sample notifications for demo purposes (only if user has none)
export async function POST() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const count = await db.notification.count({ where: { userId: session.id } })
    if (count > 0) return json({ ok: true, alreadySeeded: true })

    const samples = [
      { type: 'system', title: 'Welcome to Wishubest!', body: 'Your account is ready. Start exploring providers and book your first appointment.', link: 'browse' },
      { type: 'booking_created', title: 'Booking confirmed', body: 'Your appointment has been confirmed. Check your bookings for details.', link: 'bookings' },
      { type: 'review_received', title: 'New review', body: 'A patient left you a 5-star review. Great work!', link: 'reviews' },
    ]

    for (const s of samples) {
      await notify({ userId: session.id, ...s })
    }

    return json({ ok: true, seeded: samples.length })
  } catch (e) { return handleError(e) }
}
