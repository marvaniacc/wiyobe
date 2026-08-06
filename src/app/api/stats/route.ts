import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { getProviderBalance } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')

    if (session.role === 'ADMIN') {
      const [totalBookings, completedBookings, activeProviders, totalUsers] = await Promise.all([
        db.booking.count(),
        db.booking.count({ where: { status: 'COMPLETED' } }),
        db.user.count({ where: { role: { in: ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] }, status: 'ACTIVE' } }),
        db.user.count(),
      ])

      // platform revenue = sum of COMMISSION ledger entries
      const commissionEntries = await db.ledgerEntry.findMany({ where: { type: 'COMMISSION' } })
      const platformRevenue = commissionEntries.reduce((s, e) => s + parseFloat(e.amount), 0).toFixed(2)
      const commissionReversals = await db.ledgerEntry.findMany({ where: { type: 'REFUND_COMMISSION_REVERSAL' } })
      const reversalsTotal = commissionReversals.reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0).toFixed(2)

      const pendingProviders = await db.user.count({ where: { status: 'PENDING' } })

      // recent bookings
      const recentBookings = await db.booking.findMany({
        include: { patient: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      })

      // bookings by provider type
      const byType = await db.booking.groupBy({ by: ['providerType'], _count: true })

      // last 7 days revenue
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const recentCharges = await db.ledgerEntry.findMany({ where: { type: 'PATIENT_CHARGE', createdAt: { gte: sevenDaysAgo } } })
      const dailyRevenue: { date: string; amount: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        const key = d.toISOString().slice(0, 10)
        const amt = recentCharges.filter(e => e.createdAt.toISOString().slice(0, 10) === key).reduce((s, e) => s + parseFloat(e.amount), 0)
        dailyRevenue.push({ date: key, amount: amt })
      }

      return json({
        totalBookings, completedBookings, activeProviders, totalUsers,
        platformRevenue: (parseFloat(platformRevenue) - parseFloat(reversalsTotal)).toFixed(2),
        pendingProviders,
        recentBookings,
        byType,
        dailyRevenue,
      })
    }

    if (session.role === 'PATIENT') {
      const [totalBookings, upcoming, completed] = await Promise.all([
        db.booking.count({ where: { patientId: session.id } }),
        db.booking.count({ where: { patientId: session.id, status: 'CONFIRMED', startDate: { gte: new Date() } } }),
        db.booking.count({ where: { patientId: session.id, status: 'COMPLETED' } }),
      ])
      const spentPayments = await db.payment.findMany({
        where: { booking: { patientId: session.id }, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } },
        select: { amount: true },
      })
      const totalSpent = spentPayments.reduce((s, p) => s + parseFloat(p.amount || '0'), 0).toFixed(2)
      const recentBookings = await db.booking.findMany({
        where: { patientId: session.id },
        include: { doctor: { include: { user: { select: { name: true } } } }, hospital: { include: { user: { select: { name: true } } } }, hotel: { include: { user: { select: { name: true } } } }, translator: { include: { user: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      })
      return json({ totalBookings, upcoming, completed, totalSpent, recentBookings })
    }

    // provider
    const u = await db.user.findUnique({ where: { id: session.id }, include: { doctor: true, hospital: true, hotel: true, translator: true } })
    const where: any = {}
    let rating = 0, reviewCount = 0, providerName = ''
    if (u?.doctor) { where.doctorId = u.doctor.id; rating = u.doctor.rating; reviewCount = u.doctor.reviewCount; providerName = u.user?.name || '' }
    else if (u?.hospital) { where.hospitalId = u.hospital.id; rating = u.hospital.rating; reviewCount = u.hospital.reviewCount; providerName = u.hospital.name }
    else if (u?.hotel) { where.hotelId = u.hotel.id; rating = u.hotel.rating; reviewCount = u.hotel.reviewCount; providerName = u.hotel.name }
    else if (u?.translator) { where.translatorId = u.translator.id; rating = u.translator.rating; reviewCount = u.translator.reviewCount; providerName = u.user?.name || '' }
    else return error(403, 'Not a provider')

    const [totalBookings, upcoming, completed] = await Promise.all([
      db.booking.count({ where }),
      db.booking.count({ where: { ...where, status: 'CONFIRMED', startDate: { gte: new Date() } } }),
      db.booking.count({ where: { ...where, status: 'COMPLETED' } }),
    ])
    const balance = await getProviderBalance(session.id)
    const recentBookings = await db.booking.findMany({
      where,
      include: { patient: { select: { name: true, avatarUrl: true } }, service: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    })
    return json({ totalBookings, upcoming, completed, balance, rating, reviewCount, providerName, recentBookings })
  } catch (e) { return handleError(e) }
}
