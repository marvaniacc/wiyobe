import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/chat/conversations
 *
 * Returns the list of booking conversations the current user is party to,
 * sorted by most recent activity. Each item includes:
 *   - bookingId, booking status, startDate, visitType, providerType
 *   - the "other participant" (name, avatar, role)
 *   - the last message (preview text + createdAt + hasAttachments flag + senderId)
 *   - unread count (messages from the other party not yet read)
 *
 * Used by the dedicated Messages page sidebar.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    // Find all bookings where the current user is the patient or the provider.
    const bookings = await db.booking.findMany({
      where: {
        OR: [
          { patientId: session.id },
          { doctor: { userId: session.id } },
          { hospital: { userId: session.id } },
          { hotel: { userId: session.id } },
          { translator: { userId: session.id } },
        ],
        status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED'] },
      },
      include: {
        doctor: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
        hospital: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
        hotel: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
        translator: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
        // NOTE: booking.patient is a User directly (not a Patient model with a nested user)
        patient: { select: { id: true, name: true, avatarUrl: true, role: true } },
        service: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Resolve the "other participant" for each booking from the caller's perspective
    const participantByBooking = bookings.map((b) => {
      let puid: string | null = null
      if (b.providerType === 'DOCTOR' && b.doctor) puid = b.doctor.userId
      else if (b.providerType === 'HOSPITAL' && b.hospital) puid = b.hospital.userId
      else if (b.providerType === 'HOTEL' && b.hotel) puid = b.hotel.userId
      else if (b.providerType === 'TRANSLATOR' && b.translator) puid = b.translator.userId
      const isPatient = b.patientId === session.id
      let other: { id: string | null; name: string | null; avatarUrl: string | null; role: string }
      if (isPatient) {
        const u = b.doctor?.user || b.hospital?.user || b.hotel?.user || b.translator?.user || null
        other = { id: u?.id ?? puid, name: u?.name ?? null, avatarUrl: u?.avatarUrl ?? null, role: b.providerType }
      } else {
        // patient is the User directly
        const u = b.patient || null
        other = { id: b.patientId, name: u?.name ?? null, avatarUrl: u?.avatarUrl ?? null, role: 'PATIENT' }
      }
      return { bookingId: b.id, other }
    })

    const bookingIds = bookings.map((b) => b.id)

    // Last message per booking (group then fetch)
    const lastMessages = await db.chatMessage.groupBy({
      by: ['bookingId'],
      where: { bookingId: { in: bookingIds } },
      _max: { createdAt: true },
    })
    const lastAtByBooking = new Map(lastMessages.map((m) => [m.bookingId, m._max.createdAt]))

    const lastMessageRows: any[] = []
    for (const [bookingId, lastAt] of lastAtByBooking.entries()) {
      if (!lastAt) continue
      const row = await db.chatMessage.findFirst({
        where: { bookingId, createdAt: lastAt },
        select: {
          id: true, message: true, senderId: true, createdAt: true,
          attachments: { select: { id: true } },
        },
      })
      if (row) lastMessageRows.push({ bookingId, ...row })
    }

    // Unread counts per booking (messages from the other party not yet read)
    const unread = await db.chatMessage.groupBy({
      by: ['bookingId'],
      where: {
        bookingId: { in: bookingIds },
        read: false,
        senderId: { not: session.id },
      },
      _count: { id: true },
    })
    const unreadByBooking = new Map(unread.map((u) => [u.bookingId, u._count.id]))

    const conversations = bookings.map((b) => {
      const { other } = participantByBooking.find((p) => p.bookingId === b.id)!
      const lastRow = lastMessageRows.find((r) => r.bookingId === b.id)
      const preview = lastRow
        ? (lastRow.message
            ? (lastRow.message.length > 80 ? lastRow.message.slice(0, 80) + '…' : lastRow.message)
            : (lastRow.attachments.length > 0
                ? `📎 ${lastRow.attachments.length} attachment${lastRow.attachments.length > 1 ? 's' : ''}`
                : ''))
        : ''
      return {
        bookingId: b.id,
        status: b.status,
        startDate: b.startDate.toISOString(),
        visitType: b.visitType,
        providerType: b.providerType,
        serviceTitle: b.service?.name || null,
        amount: b.amount,
        currency: b.currency,
        participant: other,
        lastMessage: lastRow
          ? {
              id: lastRow.id,
              preview,
              senderId: lastRow.senderId,
              createdAt: lastRow.createdAt.toISOString(),
              hasAttachments: lastRow.attachments.length > 0,
            }
          : null,
        unreadCount: unreadByBooking.get(b.id) || 0,
      }
    })

    // Sort: conversations with a last message first (by recency), then bookings without messages (by startDate desc)
    conversations.sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
      }
      if (a.lastMessage) return -1
      if (b.lastMessage) return 1
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })

    return json({ conversations })
  } catch (e) { return handleError(e) }
}
