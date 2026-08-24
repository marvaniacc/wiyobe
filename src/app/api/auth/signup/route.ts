import { db } from '@/lib/db'
import { hashPassword, setSessionCookie } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    return json({ session })
  } catch (e) { return handleError(e) }
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['PATIENT', 'DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR', 'AFFILIATE']),
  name: z.string().min(2),
  preferredLanguage: z.enum(['en', 'tr', 'fa', 'ar', 'ru']).default('en'),
  phone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  countryId: z.string().optional(),
  cityId: z.string().optional(),
  specialty: z.string().optional(),
  languages: z.string().optional(),
  medicalLicenseNumber: z.string().optional(),
  businessRegNumber: z.string().optional(),
  starRating: z.number().int().min(1).max(5).optional(),
  specialization: z.string().optional(),
  website: z.string().optional(),
  socialMedia: z.string().optional(),
  referralCode: z.string().optional(),
  cfToken: z.string().optional(),
})

/**
 * Verify Cloudflare Turnstile token. Skips verification if no secret key
 * is configured (dev mode). Returns true on success, false on failure.
 */
async function verifyTurnstileToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET_KEY
  // Dev mode: no secret configured — allow without verification
  if (!secret) return true
  // Production hard requirement: a missing/empty token must fail closed,
  // otherwise bots bypass the challenge by simply omitting cfToken.
  if (!token) return false
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
      }),
    })
    const data = await res.json()
    return data.success === true
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, signupSchema)
    const existing = await db.user.findUnique({ where: { email: body.email } })
    if (existing) return error(409, 'An account with this email already exists.')

    // Verify Cloudflare Turnstile token (anti-bot)
    const turnstileOk = await verifyTurnstileToken(body.cfToken)
    if (!turnstileOk) {
      return error(403, 'Security verification failed. Please try again.')
    }

    // Registration control: check if signup is open for this role
    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] as const
    if (providerRoles.includes(body.role as any)) {
      const settingKey = `signupOpen${body.role.charAt(0)}${body.role.slice(1).toLowerCase()}`
      const setting = await db.siteSetting.findUnique({ where: { key: settingKey } })
      if (setting?.value === 'false') {
        return error(403, `Registration for ${body.role.toLowerCase()}s is currently closed.`)
      }
    }

    // All users (including providers) get ACTIVE status immediately.
    // The dashboard lock mechanism (kycStatus !== APPROVED) restricts
    // providers to only the KYC and Profile sections until verified.
    const status: string = 'ACTIVE'

    const user = await db.user.create({
      data: {
        email: body.email,
        passwordHash: hashPassword(body.password),
        role: body.role,
        status: status as any,
        name: body.name,
        preferredLanguage: body.preferredLanguage,
        phone: body.phone,
        country: body.country,
        city: body.city,
      },
    })

    if (body.role === 'PATIENT') {
      await db.patient.create({ data: { userId: user.id } })
    } else if (body.role === 'DOCTOR') {
      await db.doctor.create({
        data: {
          userId: user.id, specialty: body.specialty || 'General', subSpecialties: '', bio: '',
          city: body.city || '', country: body.country || '', yearsExperience: 0,
          consultationFee: '0', onlineFee: '0', languages: body.languages || body.preferredLanguage,
          education: '', certifications: '', verified: false,
        },
      })
    } else if (body.role === 'HOSPITAL') {
      await db.hospital.create({
        data: {
          userId: user.id, name: body.name, description: '', address: '',
          city: body.city || '', country: body.country || '', departments: '', accreditations: '',
          beds: 0, baseFee: '0', languages: body.languages || body.preferredLanguage, verified: false,
        },
      })
    } else if (body.role === 'HOTEL') {
      await db.hotel.create({
        data: {
          userId: user.id, name: body.name, description: '', address: '',
          city: body.city || '', country: body.country || '', starRating: 3, amenities: '', roomTypes: '',
          pricePerNight: '0', languages: body.languages || body.preferredLanguage, verified: false,
        },
      })
    } else if (body.role === 'TRANSLATOR') {
      await db.translator.create({
        data: {
          userId: user.id, languages: body.languages || body.preferredLanguage, specialization: 'general',
          bio: '', city: body.city || '', country: body.country || '', hourlyRate: '0', dailyRate: '0',
          yearsExperience: 0, verified: false,
        },
      })
    } else if (body.role === 'AFFILIATE') {
      const referralCode = (body.name || body.email).replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase()
      await db.affiliate.create({
        data: {
          userId: user.id,
          referralCode,
          website: body.website,
          socialMedia: body.socialMedia,
        },
      })
    }

    // Process referral code — link new user to the affiliate who referred them
    if (body.referralCode && body.role !== 'AFFILIATE') {
      const affiliate = await db.affiliate.findUnique({
        where: { referralCode: body.referralCode },
      })
      if (affiliate && affiliate.verified) {
        const latestClick = await db.affiliateClick.findFirst({
          where: { affiliateId: affiliate.id, status: 'CLICKED' },
          orderBy: { clickedAt: 'desc' },
        })
        if (latestClick) {
          await db.affiliateClick.update({
            where: { id: latestClick.id },
            data: { referredUserId: user.id, status: 'SIGNED_UP', convertedAt: new Date() },
          })
        } else {
          await db.affiliateClick.create({
            data: { affiliateId: affiliate.id, referredUserId: user.id, status: 'SIGNED_UP', convertedAt: new Date() },
          })
        }
        await db.affiliate.update({ where: { id: affiliate.id }, data: { totalSignups: { increment: 1 } } })
      }
    }

    if (status === 'ACTIVE') {
      await setSessionCookie(user.id, user.role)
    }

    return json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage, kycStatus: user.kycStatus },
      needsApproval: status === 'PENDING',
    }, 201)
  } catch (e) { return handleError(e) }
}
