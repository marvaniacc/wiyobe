import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { error, handleError } from '@/lib/api'
import { resolveProviderUser } from '@/lib/ledger'
import { formatCurrency, formatDate } from '@/lib/money'
import PDFDocument from 'pdfkit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/invoices/[bookingId]
 *
 * Generates a professional PDF invoice for a booking. The invoice includes:
 * - Wishubest branding
 * - Invoice number (derived from booking ID)
 * - Patient and provider details
 * - Service description, amount, payment status
 *
 * Authorization: Only the booking's patient, provider, or an admin can
 * download the invoice. Returns 403 otherwise.
 *
 * The PDF is streamed directly to the client.
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

    const providerLocation =
      booking.hospital?.city || booking.hotel?.city || booking.doctor?.user?.name ? 'N/A' : 'N/A'

    const serviceName = booking.service?.name || (booking.visitType === 'ONLINE' ? 'Online Consultation' : 'In-person Visit')
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

    // Generate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    // === Header ===
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#1A73E8').text('Wishubest', 50, 50)
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text('Global Medical Tourism Marketplace', 50, 78)
    doc.fontSize(10).fillColor('#666666').text('support@wishubest.com', 50, 92)

    // Invoice title (right-aligned)
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#333333').text('INVOICE', 400, 50, { align: 'right' })
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text(`Invoice #: ${invoiceNumber}`, 400, 78, { align: 'right' })
    doc.text(`Date: ${invoiceDate}`, 400, 92, { align: 'right' })

    // Separator line
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#DADCE0').lineWidth(1).stroke()

    // === Bill To ===
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999').text('BILLED TO', 50, 140)
    doc.fontSize(11).font('Helvetica').fillColor('#333333').text(booking.patient?.name || 'Patient', 50, 156)
    doc.fontSize(9).fillColor('#666666').text(booking.patient?.email || '', 50, 172)
    if (booking.patient?.phone) doc.text(booking.patient.phone, 50, 186)
    if (booking.patient?.city) doc.text(`${booking.patient.city}, ${booking.patient?.country || ''}`, 50, 200)

    // === Provider ===
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999').text('PROVIDER', 300, 140)
    doc.fontSize(11).font('Helvetica').fillColor('#333333').text(providerName, 300, 156)
    doc.fontSize(9).fillColor('#666666').text(providerEmail, 300, 172)
    doc.text(providerPhone, 300, 186)

    // === Booking Details ===
    doc.moveTo(50, 225).lineTo(545, 225).strokeColor('#DADCE0').lineWidth(1).stroke()

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999').text('BOOKING DETAILS', 50, 240)

    const detailsY = 260
    const detailLines = [
      ['Booking ID', booking.id],
      ['Service', serviceName],
      ['Visit Type', booking.visitType === 'ONLINE' ? 'Online Consultation' : 'In-person Visit'],
      ['Appointment Date', bookingDate],
      ['Booking Status', booking.status],
      ['Payment Status', paymentStatus],
    ]

    detailLines.forEach((line, i) => {
      const y = detailsY + i * 18
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text(line[0] + ':', 50, y)
      doc.font('Helvetica').fillColor('#333333').text(line[1], 160, y)
    })

    // === Amount Summary ===
    const summaryY = detailsY + detailLines.length * 18 + 20
    doc.moveTo(50, summaryY).lineTo(545, summaryY).strokeColor('#DADCE0').lineWidth(1).stroke()

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#999999').text('PAYMENT SUMMARY', 50, summaryY + 15)

    const amountY = summaryY + 35
    const amountLines: [string, string][] = [
      ['Service Amount', formatCurrency(booking.amount, booking.currency || 'USD', 'en')],
    ]

    if (isPatient) {
      // Patient sees only what they paid
    } else {
      // Provider/admin sees commission breakdown
      amountLines.push(['Platform Commission', `-${formatCurrency(booking.commissionAmount, booking.currency || 'USD', 'en')}`])
      amountLines.push(['Provider Net', formatCurrency(booking.providerNetAmount, booking.currency || 'USD', 'en')])
    }

    amountLines.forEach((line, i) => {
      const y = amountY + i * 20
      doc.fontSize(10).font('Helvetica').fillColor('#333333').text(line[0], 50, y)
      doc.font('Helvetica-Bold').text(line[1], 400, y, { align: 'right' })
    })

    // Total box
    const totalY = amountY + amountLines.length * 20 + 10
    doc.rect(350, totalY, 195, 30).fillColor('#1A73E8').fill()
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF').text('TOTAL PAID', 360, totalY + 9)
    doc.text(formatCurrency(booking.amount, booking.currency || 'USD', 'en'), 530, totalY + 9, { align: 'right' })

    // === Footer ===
    const footerY = totalY + 60
    doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#DADCE0').lineWidth(1).stroke()
    doc.fontSize(8).font('Helvetica').fillColor('#999999').text(
      'This invoice is generated electronically by Wishubest and is valid without signature.',
      50, footerY + 15, { align: 'center', width: 495 }
    )
    doc.text(
      'Wishubest is a medical tourism marketplace platform. Service providers are independently verified.',
      50, footerY + 30, { align: 'center', width: 495 }
    )

    doc.end()

    // Wait for PDF generation to complete
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoiceNumber}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) { return handleError(e) }
}
