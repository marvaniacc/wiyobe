import { db } from '@/lib/db'
import { error } from '@/lib/api'
import { tryNormalizeVisitType } from '@/lib/modality'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/calendar/[token]
 *
 * Returns a read-only iCal (.ics) feed of a provider's CONFIRMED and
 * COMPLETED bookings. The `token` is a cryptographically secure
 * `calendarToken` stored on the User model — it acts as the sole
 * authentication credential, so providers can subscribe to this URL in
 * Google Calendar / Apple Calendar / Outlook without logging in.
 *
 * Privacy: Only the patient's name and the service name + visit type are
 * exposed. No medical conditions, notes, amounts, or contact details are
 * included in the feed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params

    if (!token || token.length < 16) {
      return error(404, 'Not found')
    }

    // Authenticate purely via the token — no session required.
    const user = await db.user.findUnique({
      where: { calendarToken: token },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        doctor: { select: { id: true } },
        hospital: { select: { id: true } },
        hotel: { select: { id: true } },
        translator: { select: { id: true } },
      },
    })

    // Same response for "no user" and "suspended" to avoid token enumeration.
    if (!user || user.status === 'SUSPENDED') {
      return error(404, 'Not found')
    }

    // Only providers may have a calendar feed.
    const isProvider = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'].includes(user.role)
    if (!isProvider) {
      return error(403, 'Forbidden')
    }

    // Resolve the provider's entity id + type so we can query their bookings.
    let providerFilter: { providerType: ProviderType; doctorId?: string; hospitalId?: string; hotelId?: string; translatorId?: string }
    if (user.doctor) {
      providerFilter = { providerType: 'DOCTOR', doctorId: user.doctor.id }
    } else if (user.hospital) {
      providerFilter = { providerType: 'HOSPITAL', hospitalId: user.hospital.id }
    } else if (user.hotel) {
      providerFilter = { providerType: 'HOTEL', hotelId: user.hotel.id }
    } else if (user.translator) {
      providerFilter = { providerType: 'TRANSLATOR', translatorId: user.translator.id }
    } else {
      // Provider role but no linked entity record — nothing to show.
      return icalResponse(buildIcal(user.name || 'Provider', user.id, []))
    }

    // Fetch only upcoming + recent past CONFIRMED/COMPLETED bookings.
    // (Limit to the last 90 days through the next 365 days to keep the feed
    //  lightweight; calendar apps refresh periodically.)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const bookings = await db.booking.findMany({
      where: {
        ...providerFilter,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        startDate: { gte: since },
      },
      include: {
        patient: { select: { name: true } },
        service: { select: { name: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 200,
    })

    return icalResponse(buildIcal(user.name || 'Provider', user.id, bookings))
  } catch (e) {
    console.error('[calendar feed error]', e)
    return error(500, 'Internal server error')
  }
}

// ---------------------------------------------------------------------------
// iCal (RFC 5545) construction helpers
// ---------------------------------------------------------------------------

type FeedBooking = {
  id: string
  startDate: Date
  endDate: Date | null
  visitType: 'IN_PERSON' | 'ONLINE' | 'VIDEO' | 'CHAT'
  status: string
  patient: { name: string | null }
  service: { name: string | null } | null
}

/**
 * Build a complete .ics document. The feed is strictly read-only:
 * `METHOD:PUBLISH` is the only method advertised (clients may not send
 * replies or propose changes back through this feed).
 */
function buildIcal(providerName: string, providerUserId: string, bookings: FeedBooking[]): string {
  const now = formatIcalUtc(new Date())
  const calendarName = escapeIcal(`Wishubest — ${providerName}`)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wishubest//Medical Tourism Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
  ]

  for (const b of bookings) {
    const dtStart = formatIcalUtc(b.startDate)
    // Fall back to a sensible default end (start + 30 min) if endDate is null.
    const end = b.endDate ?? new Date(b.startDate.getTime() + 30 * 60 * 1000)
    const dtEnd = formatIcalUtc(end)

    const patientName = b.patient.name || 'Patient'
    // Display label via canonical modality (legacy ONLINE == VIDEO).
    const modalityLabel = tryNormalizeVisitType(b.visitType) === 'VIDEO'
      ? 'Video consultation'
      : b.visitType === 'CHAT' ? 'Chat consultation' : 'In-person visit'
    const serviceName = b.service?.name || modalityLabel

    const summary = `Appointment with ${patientName}`
    // Description intentionally excludes medical notes/amounts/contact info.
    const description = `${serviceName} — ${modalityLabel} (Wishubest booking ${b.id.slice(-8).toUpperCase()})`

    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@wishubest.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcal(summary)}`,
      `DESCRIPTION:${escapeIcal(description)}`,
      `STATUS:CONFIRMED`,
      `ORGANIZER;CN=${escapeIcal(providerName)}:mailto:noreply@wishubest.com`,
      `CATEGORIES:${escapeIcal('Medical Appointment')}`,
      `URL:https://panel.wishubest.com`,
      `X-WISHUBEST-PROVIDER:${providerUserId}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcal('Appointment reminder')}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return foldIcalLines(lines.join('\r\n'))
}

/** Format a Date as an iCal UTC timestamp: YYYYMMDDTHHMMSSZ */
function formatIcalUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

/**
 * Escape per RFC 5545: backslash, semicolon, comma, newline.
 * (Newlines become literal `\n` sequences inside a single property value.)
 */
function escapeIcal(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold long lines to 75 octets per RFC 5545 section 3.1.
 * Continuation lines begin with a single space.
 */
function foldIcalLines(text: string): string {
  const out: string[] = []
  for (const line of text.split('\r\n')) {
    if (line.length <= 75) {
      out.push(line)
      continue
    }
    let remaining = line
    out.push(remaining.slice(0, 75))
    remaining = remaining.slice(75)
    while (remaining.length > 0) {
      out.push(' ' + remaining.slice(0, 74))
      remaining = remaining.slice(74)
    }
  }
  return out.join('\r\n')
}

function icalResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="wishubest-calendar.ics"`,
      'Cache-Control': 'private, max-age=1800', // 30 min — clients refresh periodically
    },
  })
}
