import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const user = await db.user.findUnique({
      where: { id: session.id },
      include: { patient: true, doctor: true, hospital: true, hotel: true, translator: true },
    })
    return json({ user })
  } catch (e) { return handleError(e) }
}

const updateSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  preferredLanguage: z.enum(['en', 'tr', 'fa', 'ar']).optional(),
  avatarUrl: z.string().optional(),
  // patient
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  medicalHistory: z.string().optional(),
  emergencyContact: z.string().optional(),
  passportNumber: z.string().optional(),
  // doctor
  specialty: z.string().optional(),
  subSpecialties: z.string().optional(),
  bio: z.string().optional(),
  yearsExperience: z.number().optional(),
  consultationFee: z.string().optional(),
  onlineFee: z.string().optional(),
  languages: z.string().optional(),
  education: z.string().optional(),
  certifications: z.string().optional(),
  // hospital
  hospitalName: z.string().optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  departments: z.string().optional(),
  accreditations: z.string().optional(),
  beds: z.number().optional(),
  baseFee: z.string().optional(),
  // hotel
  hotelName: z.string().optional(),
  starRating: z.number().optional(),
  amenities: z.string().optional(),
  roomTypes: z.string().optional(),
  pricePerNight: z.string().optional(),
  // translator
  specialization: z.string().optional(),
  hourlyRate: z.string().optional(),
  dailyRate: z.string().optional(),
})

export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    const body = await parseBody(req, updateSchema)

    await db.user.update({
      where: { id: session.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.preferredLanguage !== undefined ? { preferredLanguage: body.preferredLanguage } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
    })

    const u = await db.user.findUnique({ where: { id: session.id }, include: { patient: true, doctor: true, hospital: true, hotel: true, translator: true } })

    if (u?.patient) {
      await db.patient.update({
        where: { userId: session.id },
        data: {
          ...(body.dateOfBirth !== undefined ? { dateOfBirth: body.dateOfBirth } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...(body.bloodGroup !== undefined ? { bloodGroup: body.bloodGroup } : {}),
          ...(body.medicalHistory !== undefined ? { medicalHistory: body.medicalHistory } : {}),
          ...(body.emergencyContact !== undefined ? { emergencyContact: body.emergencyContact } : {}),
          ...(body.passportNumber !== undefined ? { passportNumber: body.passportNumber } : {}),
        },
      })
    }
    if (u?.doctor) {
      await db.doctor.update({
        where: { userId: session.id },
        data: {
          ...(body.specialty !== undefined ? { specialty: body.specialty } : {}),
          ...(body.subSpecialties !== undefined ? { subSpecialties: body.subSpecialties } : {}),
          ...(body.bio !== undefined ? { bio: body.bio } : {}),
          ...(body.yearsExperience !== undefined ? { yearsExperience: body.yearsExperience } : {}),
          ...(body.consultationFee !== undefined ? { consultationFee: body.consultationFee } : {}),
          ...(body.onlineFee !== undefined ? { onlineFee: body.onlineFee } : {}),
          ...(body.languages !== undefined ? { languages: body.languages } : {}),
          ...(body.education !== undefined ? { education: body.education } : {}),
          ...(body.certifications !== undefined ? { certifications: body.certifications } : {}),
        },
      })
    }
    if (u?.hospital) {
      await db.hospital.update({
        where: { userId: session.id },
        data: {
          ...(body.hospitalName !== undefined ? { name: body.hospitalName } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.departments !== undefined ? { departments: body.departments } : {}),
          ...(body.accreditations !== undefined ? { accreditations: body.accreditations } : {}),
          ...(body.beds !== undefined ? { beds: body.beds } : {}),
          ...(body.baseFee !== undefined ? { baseFee: body.baseFee } : {}),
          ...(body.languages !== undefined ? { languages: body.languages } : {}),
        },
      })
    }
    if (u?.hotel) {
      await db.hotel.update({
        where: { userId: session.id },
        data: {
          ...(body.hotelName !== undefined ? { name: body.hotelName } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.starRating !== undefined ? { starRating: body.starRating } : {}),
          ...(body.amenities !== undefined ? { amenities: body.amenities } : {}),
          ...(body.roomTypes !== undefined ? { roomTypes: body.roomTypes } : {}),
          ...(body.pricePerNight !== undefined ? { pricePerNight: body.pricePerNight } : {}),
          ...(body.languages !== undefined ? { languages: body.languages } : {}),
        },
      })
    }
    if (u?.translator) {
      await db.translator.update({
        where: { userId: session.id },
        data: {
          ...(body.languages !== undefined ? { languages: body.languages } : {}),
          ...(body.specialization !== undefined ? { specialization: body.specialization } : {}),
          ...(body.bio !== undefined ? { bio: body.bio } : {}),
          ...(body.hourlyRate !== undefined ? { hourlyRate: body.hourlyRate } : {}),
          ...(body.dailyRate !== undefined ? { dailyRate: body.dailyRate } : {}),
          ...(body.yearsExperience !== undefined ? { yearsExperience: body.yearsExperience } : {}),
        },
      })
    }

    const user = await db.user.findUnique({
      where: { id: session.id },
      include: { patient: true, doctor: true, hospital: true, hotel: true, translator: true },
    })
    return json({ user })
  } catch (e) { return handleError(e) }
}
