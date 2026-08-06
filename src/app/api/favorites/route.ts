import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return json({ favorites: [] })

    const favorites = await db.favorite.findMany({
      where: { patientId: session.id },
      orderBy: { createdAt: 'desc' },
    })

    // Fetch provider details for each favorite
    const results: any[] = []
    for (const f of favorites) {
      let provider: any = null
      let name: string | null = null
      let avatarUrl: string | null = null
      let specialty = ''
      let city = ''
      let country = ''
      let rating = 0
      let reviewCount = 0
      let price = '0'
      let priceLabel = ''
      let verified = false

      if (f.providerType === 'DOCTOR') {
        provider = await db.doctor.findUnique({ where: { id: f.providerId }, include: { user: { select: { name: true, avatarUrl: true } } } })
        if (provider) {
          name = provider.user.name; avatarUrl = provider.user.avatarUrl; specialty = provider.specialty
          city = provider.city; country = provider.country; rating = provider.rating; reviewCount = provider.reviewCount
          price = provider.consultationFee; priceLabel = 'per consultation'; verified = provider.verified
        }
      } else if (f.providerType === 'HOSPITAL') {
        provider = await db.hospital.findUnique({ where: { id: f.providerId } })
        if (provider) {
          name = provider.name; specialty = provider.departments; city = provider.city; country = provider.country
          rating = provider.rating; reviewCount = provider.reviewCount; price = provider.baseFee; priceLabel = 'base fee'; verified = provider.verified
        }
      } else if (f.providerType === 'HOTEL') {
        provider = await db.hotel.findUnique({ where: { id: f.providerId } })
        if (provider) {
          name = provider.name; specialty = 'Accommodation'; city = provider.city; country = provider.country
          rating = provider.rating; reviewCount = provider.reviewCount; price = provider.pricePerNight; priceLabel = 'per night'; verified = provider.verified
        }
      } else if (f.providerType === 'TRANSLATOR') {
        provider = await db.translator.findUnique({ where: { id: f.providerId }, include: { user: { select: { name: true, avatarUrl: true } } } })
        if (provider) {
          name = provider.user.name; avatarUrl = provider.user.avatarUrl; specialty = provider.specialization
          city = provider.city; country = provider.country; rating = provider.rating; reviewCount = provider.reviewCount
          price = provider.hourlyRate; priceLabel = 'per hour'; verified = provider.verified
        }
      }

      if (provider) {
        results.push({
          id: f.id, providerId: f.providerId, providerType: f.providerType, providerUserId: f.providerUserId,
          createdAt: f.createdAt, name, avatarUrl, specialty, city, country, rating, reviewCount, price, priceLabel, verified,
        })
      }
    }

    return json({ favorites: results })
  } catch (e) { return handleError(e) }
}

const toggleSchema = z.object({
  providerId: z.string(),
  providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
  providerUserId: z.string(),
})

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'PATIENT') return error(403, 'Only patients can favorite providers')

    const body = await parseBody(req, toggleSchema)

    const existing = await db.favorite.findUnique({
      where: { patientId_providerId: { patientId: session.id, providerId: body.providerId } },
    })

    if (existing) {
      await db.favorite.delete({ where: { id: existing.id } })
      return json({ favorited: false })
    } else {
      await db.favorite.create({
        data: {
          patientId: session.id,
          providerId: body.providerId,
          providerType: body.providerType,
          providerUserId: body.providerUserId,
        },
      })
      return json({ favorited: true }, 201)
    }
  } catch (e) { return handleError(e) }
}
