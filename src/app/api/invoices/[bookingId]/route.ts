import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { error, handleError } from '@/lib/api'
import { resolveProviderUser } from '@/lib/ledger'
import { formatCurrency, formatDate } from '@/lib/money'
import { tryNormalizeVisitType } from '@/lib/modality'

// Canonical invoice label (legacy ONLINE == VIDEO).
function modalityLabel(visitType: string): string {
  const m = tryNormalizeVisitType(visitType)
  if (m === 'VIDEO') return 'Online Consultation'
  if (m === 'CHAT') return 'Chat Consultation'
  if (m === 'IN_PERSON') return 'In-person Visit'
  return 'Consultation'
}
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib'

export const dynamic = 'force-dynamic'

/**
 * GET /api/invoices/[bookingId]
 *
 * Generates a professional PDF invoice for a booking using pdf-lib
 * (pure JavaScript, no filesystem font access needed).
 *
 * Authorization: Only the booking's patient, provider, or an admin can
 * download the invoice. Returns 403 otherwise.
 */
export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    const { bookingId } = await params

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true, country: true, city: true } },
        doctor: { include: { user: { select: { name: true, email: true, phone: true } } } },
        hospital: { select: { name: true, user: { select: { email: true, phone: true } }, city: true, country: true } },
        hotel: { select: { name: true, user: { select: { email: true, phone: true } }, city: true, country: true } },
        translator: { include: { user: { select: { name: true, email: true, phone: true } } } },
        service: { select: { name: true, description: true } },
        payment: { select: { status: true, stripeChargeId: true } },
      },
    })

    if (!booking) return error(404, 'Booking not found')

    // Authorization: patient, provider, or admin only
    const providerUserId = await resolveProviderUser(booking)
    const isPatient = booking.patientId === session.id
    const isProvider = providerUserId === session.id
    const isAdmin = session.role === 'ADMIN'
    if (!isPatient && !isProvider && !isAdmin) return error(403, 'Forbidden')

    // Build invoice data
    const providerName =
      booking.doctor?.user?.name ||
      booking.hospital?.name ||
      booking.hotel?.name ||
      booking.translator?.user?.name ||
      'Provider'

    const providerEmail =
      booking.doctor?.user?.email ||
      booking.hospital?.user?.email ||
      booking.hotel?.user?.email ||
      booking.translator?.user?.email ||
      'N/A'

    const providerPhone =
      booking.doctor?.user?.phone ||
      booking.hospital?.user?.phone ||
      booking.hotel?.user?.phone ||
      booking.translator?.user?.phone ||
      'N/A'

    const serviceName = booking.service?.name || modalityLabel(booking.visitType)
    const invoiceNumber = `INV-${booking.id.slice(-8).toUpperCase()}`
    const invoiceDate = new Date().toISOString().split('T')[0]
    const bookingDate = formatDate(booking.startDate, 'en')

    const paymentStatusMap: Record<string, string> = {
      SUCCEEDED: 'Paid',
      PENDING: 'Pending',
      REFUNDED: 'Refunded',
      PARTIALLY_REFUNDED: 'Partially Refunded',
      FAILED: 'Failed',
    }
    const paymentStatus = booking.payment?.status
      ? paymentStatusMap[booking.payment.status] || booking.payment.status
      : 'N/A'

    // === Generate PDF using pdf-lib ===
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const page = pdfDoc.addPage([595.28, 841.89]) // A4
    const { width, height } = page.getSize()
    const margin = 50
    const contentWidth = width - margin * 2

    // Colors
    const blue = rgb(0.102, 0.451, 0.910) // #1A73E8
    const darkGray = rgb(0.2, 0.2, 0.2)
    const medGray = rgb(0.4, 0.4, 0.4)
    const lightGray = rgb(0.6, 0.6, 0.6)
    const veryLightGray = rgb(0.85, 0.85, 0.85)
    const white = rgb(1, 1, 1)

    let y = height - margin

    // Helper functions
    const drawText = (text: string, x: number, size: number, f: PDFFont, color: any = darkGray) => {
      page.drawText(text, { x, y, size, font: f, color })
    }
    const drawTextRight = (text: string, x: number, size: number, f: PDFFont, color: any = darkGray) => {
      const textWidth = f.widthOfTextAtSize(text, size)
      page.drawText(text, { x: x - textWidth, y, size, font: f, color })
    }
    const drawLine = (x1: number, y1: number, x2: number, y2: number, color = veryLightGray, thickness = 1) => {
      page.drawLine({ start: { x: x1, y: height - y1 }, end: { x: x2, y: height - y2 }, thickness, color })
    }
    const drawRect = (x: number, yPos: number, w: number, h: number, color: any) => {
      page.drawRectangle({ x, y: height - yPos, width: w, height: h, color })
    }
    const newY = (delta: number) => { y -= delta }

    // === Header ===
    drawText('Wishubest', margin, 24, fontBold, blue)
    newY(28)
    drawText('Global Medical Tourism Marketplace', margin, 10, font, lightGray)
    newY(14)
    drawText('support@wishubest.com', margin, 10, font, lightGray)

    // Invoice title (right-aligned)
    y = height - margin
    drawTextRight('INVOICE', width - margin, 20, fontBold, darkGray)
    newY(24)
    drawTextRight(`Invoice #: ${invoiceNumber}`, width - margin, 10, font, lightGray)
    newY(14)
    drawTextRight(`Date: ${invoiceDate}`, width - margin, 10, font, lightGray)

    // Separator line
    newY(20)
    drawLine(margin, height - y, width - margin, height - y)

    // === Bill To / Provider ===
    newY(25)
    drawText('BILLED TO', margin, 9, fontBold, lightGray)
    newY(16)
    drawText(booking.patient?.name || 'Patient', margin, 11, font, darkGray)
    newY(16)
    if (booking.patient?.email) { drawText(booking.patient.email, margin, 9, font, medGray); newY(14) }
    if (booking.patient?.phone) { drawText(booking.patient.phone, margin, 9, font, medGray); newY(14) }
    if (booking.patient?.city) { drawText(`${booking.patient.city}, ${booking.patient?.country || ''}`, margin, 9, font, medGray); newY(14) }

    // Provider (right column)
    const provX = 300
    y = height - margin - 45
    drawText('PROVIDER', provX, 9, fontBold, lightGray)
    newY(16)
    drawText(providerName, provX, 11, font, darkGray)
    newY(16)
    drawText(providerEmail, provX, 9, font, medGray)
    newY(14)
    drawText(providerPhone, provX, 9, font, medGray)

    // === Separator ===
    newY(30)
    drawLine(margin, height - y, width - margin, height - y)

    // === Booking Details ===
    newY(20)
    drawText('BOOKING DETAILS', margin, 9, fontBold, lightGray)
    newY(20)

    const detailLines: [string, string][] = [
      ['Booking ID', booking.id],
      ['Service', serviceName],
      ['Visit Type', modalityLabel(booking.visitType)],
      ['Appointment Date', bookingDate],
      ['Booking Status', booking.status],
      ['Payment Status', paymentStatus],
    ]

    for (const [label, value] of detailLines) {
      drawText(`${label}:`, margin, 9, fontBold, medGray)
      drawText(value, 160, 9, font, darkGray)
      newY(18)
    }

    // === Separator ===
    newY(10)
    drawLine(margin, height - y, width - margin, height - y)

    // === Payment Summary ===
    newY(20)
    drawText('PAYMENT SUMMARY', margin, 9, fontBold, lightGray)
    newY(25)

    const amountLines: [string, string][] = [
      ['Service Amount', formatCurrency(booking.amount, booking.currency || 'USD', 'en')],
    ]

    if (!isPatient) {
      amountLines.push(['Platform Commission', `-${formatCurrency(booking.commissionAmount, booking.currency || 'USD', 'en')}`])
      amountLines.push(['Provider Net', formatCurrency(booking.providerNetAmount, booking.currency || 'USD', 'en')])
    }

    for (const [label, value] of amountLines) {
      drawText(label, margin, 10, font, darkGray)
      drawTextRight(value, width - margin, 10, fontBold, darkGray)
      newY(20)
    }

    // Total box — draw directly with explicit y (helpers use closure y, not an arg)
    newY(5)
    const boxY = y
    drawRect(350, height - boxY, 195, 28, blue)
    page.drawText('TOTAL PAID', { x: 360, y: boxY + 9, size: 11, font: fontBold, color: white })
    const totalAmountText = formatCurrency(booking.amount, booking.currency || 'USD', 'en')
    const totalAmountWidth = fontBold.widthOfTextAtSize(totalAmountText, 11)
    page.drawText(totalAmountText, { x: width - margin - 5 - totalAmountWidth, y: boxY + 9, size: 11, font: fontBold, color: white })
    newY(45)

    // === Footer ===
    newY(30)
    drawLine(margin, height - y, width - margin, height - y)
    newY(20)
    const footerText1 = 'This invoice is generated electronically by Wishubest and is valid without signature.'
    const footerText2 = 'Wishubest is a medical tourism marketplace platform. Service providers are independently verified.'
    const fw1 = font.widthOfTextAtSize(footerText1, 8)
    const fw2 = font.widthOfTextAtSize(footerText2, 8)
    page.drawText(footerText1, { x: (width - fw1) / 2, y, size: 8, font, color: lightGray })
    newY(14)
    page.drawText(footerText2, { x: (width - fw2) / 2, y, size: 8, font, color: lightGray })

    // Serialize — pdf-lib returns a Uint8Array; wrap in Node Buffer for a
    // robust binary Response body across all Next.js runtimes.
    const pdfBytes = await pdfDoc.save()
    const body = Buffer.from(pdfBytes)

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
        'Content-Length': String(body.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) { return handleError(e) }
}
