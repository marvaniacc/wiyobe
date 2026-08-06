import { db } from '@/lib/db'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Public provider profile — no auth required. Returns sanitized public data.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type') as 'DOCTOR' | 'HOSPITAL' | 'HOTEL' | 'TRANSLATOR'
    if (!id || !type) return error(400, 'id and type required')

    let provider: any = null
    let profile: any = {}

    if (type === 'DOCTOR') {
      provider = await db.doctor.findUnique({
        where: { id },
        include: { user: { select: { name: true, avatarUrl: true } }, services: { where: { isActive: true } } },
      })
      if (provider) {
        profile = {
          id: provider.id, type: 'DOCTOR', name: provider.user.name, avatarUrl: provider.user.avatarUrl,
          specialty: provider.specialty, subSpecialties: provider.subSpecialties, bio: provider.bio,
          city: provider.city, country: provider.country, yearsExperience: provider.yearsExperience,
          consultationFee: provider.consultationFee, onlineFee: provider.onlineFee,
          languages: provider.languages, education: provider.education, certifications: provider.certifications,
          verified: provider.verified, rating: provider.rating, reviewCount: provider.reviewCount,
          services: provider.services.map((s: any) => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMinutes: s.durationMinutes })),
          address: `${provider.city}, ${provider.country}`,
        }
      }
    } else if (type === 'HOSPITAL') {
      provider = await db.hospital.findUnique({
        where: { id },
        include: { services: { where: { isActive: true } } },
      })
      if (provider) {
        profile = {
          id: provider.id, type: 'HOSPITAL', name: provider.name, avatarUrl: null,
          specialty: provider.departments, subSpecialties: provider.accreditations, bio: provider.description,
          city: provider.city, country: provider.country, yearsExperience: provider.beds,
          consultationFee: provider.baseFee, onlineFee: null,
          languages: provider.languages, education: provider.accreditations, certifications: '',
          verified: provider.verified, rating: provider.rating, reviewCount: provider.reviewCount,
          services: provider.services.map((s: any) => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMinutes: s.durationMinutes })),
          address: provider.address,
        }
      }
    } else if (type === 'HOTEL') {
      provider = await db.hotel.findUnique({
        where: { id },
        include: { services: { where: { isActive: true } } },
      })
      if (provider) {
        profile = {
          id: provider.id, type: 'HOTEL', name: provider.name, avatarUrl: null,
          specialty: 'Accommodation', subSpecialties: provider.amenities, bio: provider.description,
          city: provider.city, country: provider.country, yearsExperience: provider.starRating,
          consultationFee: provider.pricePerNight, onlineFee: null,
          languages: provider.languages, education: provider.roomTypes, certifications: '',
          verified: provider.verified, rating: provider.rating, reviewCount: provider.reviewCount,
          services: provider.services.map((s: any) => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMinutes: s.durationMinutes })),
          address: provider.address,
        }
      }
    } else if (type === 'TRANSLATOR') {
      provider = await db.translator.findUnique({
        where: { id },
        include: { user: { select: { name: true, avatarUrl: true } }, services: { where: { isActive: true } } },
      })
      if (provider) {
        profile = {
          id: provider.id, type: 'TRANSLATOR', name: provider.user.name, avatarUrl: provider.user.avatarUrl,
          specialty: provider.specialization, subSpecialties: '', bio: provider.bio,
          city: provider.city, country: provider.country, yearsExperience: provider.yearsExperience,
          consultationFee: provider.hourlyRate, onlineFee: null,
          languages: provider.languages, education: '', certifications: '',
          verified: provider.verified, rating: provider.rating, reviewCount: provider.reviewCount,
          services: provider.services.map((s: any) => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMinutes: s.durationMinutes })),
          address: `${provider.city}, ${provider.country}`,
        }
      }
    }
    if (!provider) return error(404, 'Provider not found')

    // Get reviews (public)
    const reviews = await db.review.findMany({
      where: { subjectUserId: provider.userId },
      include: { author: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    profile.reviews = reviews.map((r: any) => ({
      id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt,
      authorName: r.author?.name, reply: r.reply, repliedAt: r.repliedAt,
    }))

    return json({ profile })
  } catch (e) { return handleError(e) }
}
