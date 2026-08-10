import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Admin platform-wide analytics — revenue trends, user growth, booking volume, provider breakdown
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    // === Monthly revenue (last 12 months) ===
    const now = new Date()
    const monthlyRevenue: { month: string; revenue: number; bookings: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const monthBookings = await db.booking.count({
        where: { createdAt: { gte: d, lte: monthEnd } },
      })
      const commissionEntries = await db.ledgerEntry.findMany({
        where: { type: 'COMMISSION', createdAt: { gte: d, lte: monthEnd } },
        select: { amount: true },
      })
      const reversals = await db.ledgerEntry.findMany({
        where: { type: 'REFUND_COMMISSION_REVERSAL', createdAt: { gte: d, lte: monthEnd } },
        select: { amount: true },
      })
      const revenue = commissionEntries.reduce((s, e) => s + parseFloat(e.amount), 0) -
                      reversals.reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0)
      monthlyRevenue.push({
        month: new Intl.DateTimeFormat('en', { month: 'short' }).format(d),
        revenue: Math.round(revenue * 100) / 100,
        bookings: monthBookings,
      })
    }

    // === User growth (cumulative, last 6 months) ===
    const userGrowth: { month: string; patients: number; providers: number; total: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const patients = await db.user.count({
        where: { role: 'PATIENT', createdAt: { lte: monthEnd } },
      })
      const providers = await db.user.count({
        where: { role: { in: ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] }, createdAt: { lte: monthEnd } },
      })
      userGrowth.push({
        month: new Intl.DateTimeFormat('en', { month: 'short' }).format(d),
        patients,
        providers,
        total: patients + providers,
      })
    }

    // === Booking volume by provider type ===
    const bookingsByType = await db.booking.groupBy({
      by: ['providerType'],
      _count: true,
    })
    const providerTypeData = bookingsByType.map(b => ({
      name: b.providerType.charAt(0) + b.providerType.slice(1).toLowerCase(),
      value: b._count,
    }))

    // === Revenue by provider type ===
    const revenueByTypeRaw = await db.ledgerEntry.findMany({
      where: { type: 'COMMISSION' },
      include: { booking: { select: { providerType: true } } },
    })
    const revenueByTypeMap: Record<string, number> = {}
    for (const e of revenueByTypeRaw) {
      const pt = e.booking?.providerType || 'OTHER'
      revenueByTypeMap[pt] = (revenueByTypeMap[pt] || 0) + parseFloat(e.amount)
    }
    const revenueByType = Object.entries(revenueByTypeMap).map(([name, value]) => ({
      name: name.charAt(0) + name.slice(1).toLowerCase(),
      value: Math.round(value * 100) / 100,
    }))

    // === Top providers by revenue ===
    const allProviders = await db.user.findMany({
      where: { role: { in: ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] }, status: 'ACTIVE' },
      include: {
        doctor: { include: { user: { select: { name: true } } } },
        hospital: true,
        hotel: true,
        translator: { include: { user: { select: { name: true } } } },
      },
    })
    const providerRevenuePromises = allProviders.map(async (u) => {
      const entries = await db.ledgerEntry.findMany({
        where: { userId: u.id, type: 'PROVIDER_CREDIT' },
        select: { amount: true },
      })
      const revenue = entries.reduce((s, e) => s + parseFloat(e.amount), 0)
      const name = u.doctor?.user?.name || u.hospital?.name || u.hotel?.name || u.translator?.user?.name || u.name || u.email
      const type = u.doctor ? 'Doctor' : u.hospital ? 'Hospital' : u.hotel ? 'Hotel' : 'Translator'
      return { name, type, revenue: Math.round(revenue * 100) / 100, email: u.email }
    })
    const topProviders = (await Promise.all(providerRevenuePromises))
      .filter(p => p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // === Summary stats ===
    const [totalUsers, totalProviders, totalPatients, totalBookings, completedBookings] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: { in: ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] } } }),
      db.user.count({ where: { role: 'PATIENT' } }),
      db.booking.count(),
      db.booking.count({ where: { status: 'COMPLETED' } }),
    ])

    const commissionEntries = await db.ledgerEntry.findMany({ where: { type: 'COMMISSION' }, select: { amount: true } })
    const reversals = await db.ledgerEntry.findMany({ where: { type: 'REFUND_COMMISSION_REVERSAL' }, select: { amount: true } })
    const platformRevenue = commissionEntries.reduce((s, e) => s + parseFloat(e.amount), 0) -
                            reversals.reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0)

    const patientCharges = await db.ledgerEntry.findMany({ where: { type: 'PATIENT_CHARGE' }, select: { amount: true } })
    const totalProcessed = patientCharges.reduce((s, e) => s + parseFloat(e.amount), 0)

    const refunds = await db.ledgerEntry.findMany({ where: { type: 'REFUND_PATIENT' }, select: { amount: true } })
    const totalRefunded = refunds.reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0)

    return json({
      monthlyRevenue,
      userGrowth,
      providerTypeData,
      revenueByType,
      topProviders,
      summary: {
        totalUsers,
        totalProviders,
        totalPatients,
        totalBookings,
        completedBookings,
        platformRevenue: platformRevenue.toFixed(2),
        totalProcessed: totalProcessed.toFixed(2),
        totalRefunded: totalRefunded.toFixed(2),
        completionRate: totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 1000) / 10 : 0,
      },
    })
  } catch (e) { return handleError(e) }
}
