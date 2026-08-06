import { db } from '@/lib/db'
import { hashPassword, setSessionCookie } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 5

const schema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['signup', 'signin', 'reset']),
  // For reset purpose, the new password
  newPassword: z.string().min(6).optional(),
})

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)

    // Find the latest valid OTP for this email+purpose
    const otp = await db.otpCode.findFirst({
      where: { email: body.email, purpose: body.purpose, used: false },
      orderBy: { createdAt: 'desc' },
    })

    if (!otp) {
      return error(404, 'No active code found. Please request a new one.')
    }

    // Check expiry
    if (otp.expiresAt < new Date()) {
      await db.otpCode.update({ where: { id: otp.id }, data: { used: true } })
      return error(410, 'This code has expired. Please request a new one.')
    }

    // Check attempts
    if (otp.attempts >= MAX_ATTEMPTS) {
      await db.otpCode.update({ where: { id: otp.id }, data: { used: true } })
      return error(429, 'Too many attempts. Please request a new code.')
    }

    // Verify code
    if (otp.code !== body.code) {
      await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
      const remaining = MAX_ATTEMPTS - (otp.attempts + 1)
      return error(400, `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`)
    }

    // Mark code as used
    await db.otpCode.update({ where: { id: otp.id }, data: { used: true } })

    // === SIGNUP: create the user ===
    if (body.purpose === 'signup') {
      if (!otp.payload) return error(400, 'Missing signup data. Please start over.')
      const data = JSON.parse(otp.payload)
      const status = data.role === 'PATIENT' ? 'ACTIVE' : 'PENDING'

      const user = await db.user.create({
        data: {
          email: body.email,
          passwordHash: hashPassword(data.password),
          role: data.role,
          status: status as any,
          name: data.name,
          preferredLanguage: data.preferredLanguage,
          phone: data.phone,
          country: data.country,
          city: data.city,
          authProvider: 'password',
          emailVerified: new Date(),
        },
      })

      // Create role-specific profile
      if (data.role === 'PATIENT') {
        await db.patient.create({ data: { userId: user.id } })
      } else if (data.role === 'DOCTOR') {
        await db.doctor.create({
          data: {
            userId: user.id, specialty: data.specialty || 'General', subSpecialties: '', bio: '',
            city: data.city || '', country: data.country || '', yearsExperience: 0,
            consultationFee: '0', onlineFee: '0', languages: data.languages || data.preferredLanguage,
            education: '', certifications: '', verified: false,
          },
        })
      } else if (data.role === 'HOSPITAL') {
        await db.hospital.create({
          data: {
            userId: user.id, name: data.name, description: '', address: '',
            city: data.city || '', country: data.country || '', departments: '', accreditations: '',
            beds: 0, baseFee: '0', languages: data.languages || data.preferredLanguage, verified: false,
          },
        })
      } else if (data.role === 'HOTEL') {
        await db.hotel.create({
          data: {
            userId: user.id, name: data.name, description: '', address: '',
            city: data.city || '', country: data.country || '', starRating: 3, amenities: '', roomTypes: '',
            pricePerNight: '0', languages: data.languages || data.preferredLanguage, verified: false,
          },
        })
      } else if (data.role === 'TRANSLATOR') {
        await db.translator.create({
          data: {
            userId: user.id, languages: data.languages || data.preferredLanguage, specialization: 'general',
            bio: '', city: data.city || '', country: data.country || '', hourlyRate: '0', dailyRate: '0',
            yearsExperience: 0, verified: false,
          },
        })
      } else if (data.role === 'AFFILIATE') {
        const referralCode = (data.name || body.email).replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase()
        await db.affiliate.create({
          data: {
            userId: user.id,
            referralCode,
            commissionRate: '10',
          },
        })
      }

      if (status === 'ACTIVE') {
        await setSessionCookie(user.id, user.role)
      }

      return json({
        user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage },
        needsApproval: status === 'PENDING',
        verified: true,
      }, 201)
    }

    // === SIGNIN: log the user in ===
    if (body.purpose === 'signin') {
      const user = await db.user.findUnique({ where: { email: body.email } })
      if (!user) return error(404, 'Account not found.')
      if (user.status === 'SUSPENDED') return error(403, 'Your account has been suspended.')
      if (user.status === 'PENDING') return error(403, 'Your account is pending admin approval.')

      // Mark email verified
      await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } })

      await setSessionCookie(user.id, user.role)
      return json({
        user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage },
        verified: true,
      })
    }

    // === RESET: set new password ===
    if (body.purpose === 'reset') {
      if (!body.newPassword) return error(400, 'New password is required.')
      const user = await db.user.findUnique({ where: { email: body.email } })
      if (!user) return error(404, 'Account not found.')
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: hashPassword(body.newPassword), emailVerified: new Date() },
      })
      return json({ reset: true, verified: true })
    }

    return error(400, 'Invalid purpose.')
  } catch (e) { return handleError(e) }
}
