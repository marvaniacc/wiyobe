import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { getCommissionRate, resolveProviderUser, recordPaymentLedger } from '@/lib/ledger'
import { notify } from '@/lib/notify'
import { toDec, mulDec, subDec } from '@/lib/money'
import { z } from 'zod'
import type { ProviderType } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const role = searchParams.get('role') // for admin filter

    let where: any = {}
    if (session.role === 'PATIENT') {
      where.patientId = session.id
    } else if (session.role === 'ADMIN') {
      if (role === 'patient' && searchParams.get('patientId')) where.patientId = searchParams.get('patientId')
    } else {
      // provider: bookings where they are the provider
      const providerUser = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
      const d = providerUser?.doctor?.id, h = providerUser?.hospital?.id, ho = providerUser?.hotel?.id, t = providerUser?.translator?.id
      where = {
        OR: [
          ...(d ? [{ doctorId: d }] : []),
          ...(h ? [{ hospitalId: h }] : []),
          ...(ho ? [{ hotelId: ho }] : []),
          ...(t ? [{ translatorId: t }] : []),
        ],
      }
    }
    if (status) where.status = status

    const bookings = await db.booking.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, email: true, avatarUrl: true } },
        doctor: { include: { user: { select: { name: true } } } },
        hospital: { include: { user: { select: { name: true } } } },
        hotel: { include: { user: { select: { name: true } } } },
        translator: { include: { user: { select: { name: true } } } },
        service: true,
        slot: true,
        payment: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return json({ bookings })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
  providerId: z.string(),
  serviceId: z.string().optional(),
  slotId: z.string().optional(),
  visitType: z.enum(['IN_PERSON', 'ONLINE']),
  startDate: z.string(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Only patients can book')

    const body = await parseBody(req, createSchema)
    const pt = body.providerType as ProviderType

    // resolve provider + price
    let providerUserId: string | null = null
    let amount = '0'
    let providerName = ''
    if (pt === 'DOCTOR') {
      const d = await db.doctor.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!d || !d.verified) return error(404, 'Doctor not found or not verified')
      providerUserId = d.userId
      providerName = d.user.name || 'Doctor'
      amount = body.visitType === 'ONLINE' ? d.onlineFee : d.consultationFee
    } else if (pt === 'HOSPITAL') {
      const h = await db.hospital.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!h || !h.verified) return error(404, 'Hospital not found')
      providerUserId = h.userId
      providerName = h.name
      amount = h.baseFee
    } else if (pt === 'HOTEL') {
      const h = await db.hotel.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!h || !h.verified) return error(404, 'Hotel not found')
      providerUserId = h.userId
      providerName = h.name
      amount = h.pricePerNight
    } else if (pt === 'TRANSLATOR') {
      const t = await db.translator.findUnique({ where: { id: body.providerId }, include: { user: true } })
      if (!t || !t.verified) return error(404, 'Translator not found')
      providerUserId = t.userId
      providerName = t.user.name || 'Translator'
      amount = t.hourlyRate
    }
    if (!providerUserId) return error(400, 'Could not resolve provider')

    // override amount with service price if provided
    if (body.serviceId) {
      const svc = await db.service.findUnique({ where: { id: body.serviceId } })
      if (svc) amount = svc.price
    }

    // if slot provided, lock it
    let slot: any = null
    if (body.slotId) {
      slot = await db.slot.findUnique({ where: { id: body.slotId } })
      if (!slot || slot.isBooked) return error(409, 'This slot is no longer available')
    }

    const commissionRate = await getCommissionRate(pt)
    const commissionAmount = (parseFloat(amount) * (parseFloat(commissionRate) / 100)).toFixed(2)
    const providerNet = subDec(amount, commissionAmount)

    // video session URL for online visits — third-party embed/redirect (mock link)
    const videoSessionUrl = body.visitType === 'ONLINE'
      ? `https://meet.jit.si/medtravel-${session.id.slice(-6)}-${Date.now().toString(36)}`
      : null

    const booking = await db.booking.create({
      data: {
        patientId: session.id,
        providerType: pt,
        doctorId: pt === 'DOCTOR' ? body.providerId : null,
        hospitalId: pt === 'HOSPITAL' ? body.providerId : null,
        hotelId: pt === 'HOTEL' ? body.providerId : null,
        translatorId: pt === 'TRANSLATOR' ? body.providerId : null,
        serviceId: body.serviceId || null,
        slotId: body.slotId || null,
        visitType: body.visitType,
        status: 'CONFIRMED',
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        amount: toDec(amount),
        commissionRate,
        commissionAmount,
        providerNetAmount: providerNet,
        videoSessionUrl,
        notes: body.notes,
      },
      include: { patient: { select: { name: true } }, service: true },
    })

    // mark slot booked
    if (slot) {
      await db.slot.update({ where: { id: slot.id }, data: { isBooked: true } })
    }

    // Payment — platform's own Stripe account charge (mock for MVP; real Stripe keys absent)
    // In production this is where stripe.paymentIntents.create / charges.create runs.
    const payment = await db.payment.create({
      data: {
        bookingId: booking.id,
        stripeChargeId: `ch_mock_${booking.id.slice(-8)}`,
        amount: toDec(amount),
        status: 'SUCCEEDED',
      },
    })

    // Ledger entries
    await recordPaymentLedger({
      bookingId: booking.id,
      paymentId: payment.id,
      amount: toDec(amount),
      commissionRate,
      providerUserId,
      description: `Payment for ${providerName} — ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'}`,
    })

    // Notifications — notify both patient and provider
    const patientUser = await db.user.findUnique({ where: { id: session.id }, select: { name: true } })
    const patientName = patientUser?.name || 'Patient'
    await notify({
      userId: session.id,
      type: 'booking_created',
      title: 'Booking confirmed!',
      body: `Your ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'} with ${providerName} has been confirmed.`,
      link: 'bookings',
      meta: { bookingId: booking.id, amount: toDec(amount) },
    })
    await notify({
      userId: providerUserId,
      type: 'booking_created',
      title: 'New booking received',
      body: `${patientName} booked a ${body.visitType === 'ONLINE' ? 'online consultation' : 'in-person visit'} with you.`,
      link: 'appointments',
      meta: { bookingId: booking.id, amount: toDec(amount) },
    })

    return json({ booking, payment }, 201)
  } catch (e) { return handleError(e) }
}
