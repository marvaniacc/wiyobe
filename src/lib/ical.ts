// iCalendar (.ics) file generation utility
// Generates a standards-compliant .ics file for booking calendar exports.

interface ICalEvent {
  uid: string
  title: string
  description: string
  location?: string
  startTime: Date
  endTime: Date
  organizer?: { name: string; email?: string }
  attendees?: Array<{ name: string; email?: string }>
}

function formatICalDate(date: Date): string {
  // Format: YYYYMMDDTHHMMSSZ (UTC)
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function generateICal(event: ICalEvent): string {
  const now = formatICalDate(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wishubest//Medical Tourism Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@wishubest.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatICalDate(event.startTime)}`,
    `DTEND:${formatICalDate(event.endTime)}`,
    `SUMMARY:${escapeICalText(event.title)}`,
    `DESCRIPTION:${escapeICalText(event.description)}`,
  ]

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`)
  }

  if (event.organizer) {
    const email = event.organizer.email || 'noreply@wishubest.com'
    lines.push(`ORGANIZER;CN=${escapeICalText(event.organizer.name)}:mailto:${email}`)
  }

  if (event.attendees) {
    for (const att of event.attendees) {
      const email = att.email || 'noreply@wishubest.com'
      lines.push(`ATTENDEE;CN=${escapeICalText(att.name)};ROLE=REQ-PARTICIPANT:mailto:${email}`)
    }
  }

  // Set a 1-hour alarm reminder
  lines.push('BEGIN:VALARM')
  lines.push('TRIGGER:-PT1H')
  lines.push('ACTION:DISPLAY')
  lines.push(`DESCRIPTION:${escapeICalText(event.title)}`)
  lines.push('END:VALARM')

  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')

  return lines.join('\r\n')
}

export function downloadICal(filename: string, event: ICalEvent) {
  const ics = generateICal(event)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
