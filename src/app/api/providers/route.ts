import { db } from '@/lib/db'
import { json, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Unified browse across all provider types with filtering, sorting, search.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = (searchParams.get('type') || 'all').toLowerCase() // doctor|hospital|hotel|translator|all
    const q = (searchParams.get('q') || '').toLowerCase().trim()
    const city = searchParams.get('city') || ''
    const country = searchParams.get('country') || ''
    const sort = searchParams.get('sort') || 'rating' // rating|priceLow|priceHigh
    const maxPrice = searchParams.get('maxPrice')

    const results: any[] = []

    const cityFilter = (field: string) => city ? { [field]: { contains: city } } : {}
    const countryFilter = (field: string) => country ? { [field]: { contains: country } } : {}
    const verifiedFilter = { verified: true }

    if (type === 'all' || type === 'doctor') {
      const doctors = await db.doctor.findMany({
        where: {
          ...verifiedFilter,
          ...(q ? {
            OR: [
              { specialty: { contains: q } },
              { subSpecialties: { contains: q } },
              { bio: { contains: q } },
              { city: { contains: q } },
              { country: { contains: q } },
            ]
          } : {}),
          ...cityFilter('city'),
          ...countryFilter('country'),
          ...(maxPrice ? { consultationFee: { lte: maxPrice } } : {}),
        },
        include: { user: { select: { name: true, email: true, avatarUrl: true, id: true } } },
      })
      for (const d of doctors) {
        results.push({
          id: d.id, providerType: 'DOCTOR', userId: d.userId, name: d.user.name, avatarUrl: d.user.avatarUrl,
          specialty: d.specialty, subSpecialties: d.subSpecialties, bio: d.bio, city: d.city, country: d.country,
          yearsExperience: d.yearsExperience, languages: d.languages, education: d.education, certifications: d.certifications,
          verified: d.verified, rating: d.rating, reviewCount: d.reviewCount,
          price: d.consultationFee, onlinePrice: d.onlineFee, priceLabel: 'per consultation',
          address: `${d.city}, ${d.country}`, extra: { onlineFee: d.onlineFee },
        })
      }
    }

    if (type === 'all' || type === 'hospital') {
      const hospitals = await db.hospital.findMany({
        where: {
          ...verifiedFilter,
          ...(q ? {
            OR: [{ name: { contains: q } }, { description: { contains: q } }, { departments: { contains: q } }, { city: { contains: q } }]
          } : {}),
          ...cityFilter('city'),
          ...countryFilter('country'),
          ...(maxPrice ? { baseFee: { lte: maxPrice } } : {}),
        },
        include: { user: { select: { name: true, email: true, avatarUrl: true, id: true } } },
      })
      for (const h of hospitals) {
        results.push({
          id: h.id, providerType: 'HOSPITAL', userId: h.userId, name: h.name, avatarUrl: h.user.avatarUrl,
          specialty: h.departments, subSpecialties: h.accreditations, bio: h.description, city: h.city, country: h.country,
          yearsExperience: h.beds, languages: h.languages, education: h.accreditations, certifications: '',
          verified: h.verified, rating: h.rating, reviewCount: h.reviewCount,
          price: h.baseFee, onlinePrice: null, priceLabel: 'base fee',
          address: h.address, extra: { beds: h.beds, departments: h.departments },
        })
      }
    }

    if (type === 'all' || type === 'hotel') {
      const hotels = await db.hotel.findMany({
        where: {
          ...verifiedFilter,
          ...(q ? {
            OR: [{ name: { contains: q } }, { description: { contains: q } }, { amenities: { contains: q } }, { city: { contains: q } }]
          } : {}),
          ...cityFilter('city'),
          ...countryFilter('country'),
          ...(maxPrice ? { pricePerNight: { lte: maxPrice } } : {}),
        },
        include: { user: { select: { name: true, email: true, avatarUrl: true, id: true } } },
      })
      for (const h of hotels) {
        results.push({
          id: h.id, providerType: 'HOTEL', userId: h.userId, name: h.name, avatarUrl: h.user.avatarUrl,
          specialty: 'Accommodation', subSpecialties: h.amenities, bio: h.description, city: h.city, country: h.country,
          yearsExperience: h.starRating, languages: h.languages, education: h.roomTypes, certifications: '',
          verified: h.verified, rating: h.rating, reviewCount: h.reviewCount,
          price: h.pricePerNight, onlinePrice: null, priceLabel: 'per night',
          address: h.address, extra: { starRating: h.starRating, amenities: h.amenities, roomTypes: h.roomTypes },
        })
      }
    }

    if (type === 'all' || type === 'translator') {
      const translators = await db.translator.findMany({
        where: {
          ...verifiedFilter,
          ...(q ? {
            OR: [{ languages: { contains: q } }, { specialization: { contains: q } }, { bio: { contains: q } }, { city: { contains: q } }]
          } : {}),
          ...cityFilter('city'),
          ...countryFilter('country'),
          ...(maxPrice ? { hourlyRate: { lte: maxPrice } } : {}),
        },
        include: { user: { select: { name: true, email: true, avatarUrl: true, id: true } } },
      })
      for (const t of translators) {
        results.push({
          id: t.id, providerType: 'TRANSLATOR', userId: t.userId, name: t.user.name, avatarUrl: t.user.avatarUrl,
          specialty: t.specialization, subSpecialties: '', bio: t.bio, city: t.city, country: t.country,
          yearsExperience: t.yearsExperience, languages: t.languages, education: '', certifications: '',
          verified: t.verified, rating: t.rating, reviewCount: t.reviewCount,
          price: t.hourlyRate, onlinePrice: null, priceLabel: 'per hour',
          address: `${t.city}, ${t.country}`, extra: { dailyRate: t.dailyRate, hourlyRate: t.hourlyRate },
        })
      }
    }

    // Sort
    results.sort((a, b) => {
      if (sort === 'priceLow') return parseFloat(a.price) - parseFloat(b.price)
      if (sort === 'priceHigh') return parseFloat(b.price) - parseFloat(a.price)
      if (sort === 'reviews') return b.reviewCount - a.reviewCount
      return b.rating - a.rating // default rating
    })

    return json({ results, count: results.length })
  } catch (e) { return handleError(e) }
}
