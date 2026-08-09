import { db } from '@/lib/db'
import { resolveProviderUser } from '@/lib/ledger'
import type { SessionUser } from '@/lib/auth'

/**
 * Shared authorization for all booking-chat endpoints.
 *
 * A conversation associated with a booking is only accessible by:
 *   1. The patient who owns that booking
 *   2. The provider associated with that booking
 *   3. An authenticated admin
 *
 * No other user may view / send / translate / upload / download.
 *
 * Returns the booking (with provider relations) when authorized, or null.
 */
export async function authorizeBookingChat(
  bookingId: string,
  session: SessionUser,
): Promise<{ booking: any; providerUserId: string | null; isPatient: boolean; isProvider: boolean; isAdmin: boolean } | null> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      doctor: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
      hospital: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
      hotel: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
      translator: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
      // NOTE: booking.patient is a User directly (Booking.patientId → User.id)
      patient: { select: { id: true, name: true, avatarUrl: true, role: true } },
    },
  })
  if (!booking) return null

  const providerUserId = await resolveProviderUser(booking)
  const isPatient = booking.patientId === session.id
  const isProvider = providerUserId === session.id
  const isAdmin = session.role === 'ADMIN'
  if (!isPatient && !isProvider && !isAdmin) return null

  return { booking, providerUserId, isPatient, isProvider, isAdmin }
}

/**
 * Resolve the "other participant" in a booking chat (the party that is NOT the current user).
 * For an admin viewing the conversation we default to returning the patient's user id.
 */
export function getOtherParticipant(
  booking: any,
  providerUserId: string | null,
  session: SessionUser,
): { id: string | null; name: string | null; avatarUrl: string | null; role: string } {
  const isPatient = booking.patientId === session.id
  if (isPatient) {
    // other party is the provider
    const provUser =
      booking.doctor?.user || booking.hospital?.user || booking.hotel?.user || booking.translator?.user || null
    return {
      id: provUser?.id ?? providerUserId,
      name: provUser?.name ?? null,
      avatarUrl: provUser?.avatarUrl ?? null,
      role: booking.providerType as string,
    }
  }
  // other party is the patient (booking.patient IS the User)
  const patUser = booking.patient || null
  return {
    id: booking.patientId,
    name: patUser?.name ?? null,
    avatarUrl: patUser?.avatarUrl ?? null,
    role: 'PATIENT',
  }
}
