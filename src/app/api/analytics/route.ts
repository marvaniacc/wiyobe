import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'
import { tryNormalizeVisitType } from '@/lib/modality'

export const dynamic = 'force-dynamic'

// Provider analytics — earnings over time, booking trends, visit type breakdown
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (!['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'].includes(session.role)) {
      return error(403, 'Providers only')
    }

    const u = await db.user.findUnique({
      where: { id: session.id },
      include: { doctor: true, hospital: true, hotel: true, translator: true },
    })
    if (!u) return error(404, 'User not found')

    // Build provider filter
    let where: any = {}
    if (u.doctor) where = { doctorId: u.doctor.id }
    else if (u.hospital) where = { hospitalId: u.hospital.id }
    else if (u.hotel) where = { hotelId: u.hotel.id }
    else if (u.translator) where = { translatorId: u.translator.id }
    else return error(403, 'No provider profile')

    // Get all bookings for this provider
    const bookings = await db.booking.findMany({
      where,
      select: {
        id: true,
        status: true,
        visitType: true,
        amount: true,
        providerNetAmount: true,
        startDate: true,
        createdAt: true,
        service: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Monthly earnings (last 12 months)
    const now = new Date()
    const monthlyEarnings: { month: string; earnings: number; bookings: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const monthBookings = bookings.filter(b => b.createdAt >= d && b.createdAt <= monthEnd)
      const earnings = monthBookings
        .filter(b => b.status === 'COMPLETED' || b.status === 'CONFIRMED')
        .reduce((s, b) => s + parseFloat(b.providerNetAmount), 0)
      monthlyEarnings.push({
        month: new Intl.DateTimeFormat('en', { month: 'short' }).format(d),
        earnings: Math.round(earnings * 100) / 100,
        bookings: monthBookings.length,
      })
    }

    // Visit type breakdown — in canonical modality space: VIDEO + historical
    // ONLINE count together as "online/remote" (no row is rewritten).
    const inPersonCount = bookings.filter(b => tryNormalizeVisitType(b.visitType) === 'IN_PERSON').length
    const onlineCount = bookings.filter(b => tryNormalizeVisitType(b.visitType) === 'VIDEO').length

    // Status breakdown
    const statusBreakdown = {
      confirmed: bookings.filter(b => b.status === 'CONFIRMED').length,
      completed: bookings.filter(b => b.status === 'COMPLETED').length,
      cancelled: bookings.filter(b => b.status === 'CANCELLED').length,
    }

    // Top services by revenue
    const serviceMap: Record<string, { revenue: number; count: number }> = {}
    for (const b of bookings) {
      const name = b.service?.name || 'General'
      if (!serviceMap[name]) serviceMap[name] = { revenue: 0, count: 0 }
      serviceMap[name].revenue += parseFloat(b.providerNetAmount)
      serviceMap[name].count++
    }
    const topServices = Object.entries(serviceMap)
      .map(([name, data]) => ({ name, revenue: Math.round(data.revenue * 100) / 100, count: data.count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // Total stats
    const totalEarnings = bookings
      .filter(b => b.status === 'COMPLETED' || b.status === 'CONFIRMED')
      .reduce((s, b) => s + parseFloat(b.providerNetAmount), 0)
    const avgBookingValue = bookings.length > 0
      ? bookings.reduce((s, b) => s + parseFloat(b.amount), 0) / bookings.length
      : 0
    const completionRate = bookings.length > 0
      ? (statusBreakdown.completed / bookings.length) * 100
      : 0
    const cancellationRate = bookings.length > 0
      ? (statusBreakdown.cancelled / bookings.length) * 100
      : 0

    return json({
      monthlyEarnings,
      visitTypeBreakdown: { inPerson: inPersonCount, online: onlineCount },
      statusBreakdown,
      topServices,
      totals: {
        totalEarnings: totalEarnings.toFixed(2),
        avgBookingValue: avgBookingValue.toFixed(2),
        completionRate: Math.round(completionRate * 10) / 10,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        totalBookings: bookings.length,
      },
    })
  } catch (e) { return handleError(e) }
}
