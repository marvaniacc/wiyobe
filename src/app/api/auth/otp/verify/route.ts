import { db } from '@/lib/db'
import { hashPassword, setSessionCookie, invalidateSessions } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import crypto from 'crypto'
import { cookies } from 'next/headers'

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

      // Registration control: check if signup is open for this role
      const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'] as const
      if (providerRoles.includes(data.role as any)) {
        const settingKey = `signupOpen${data.role.charAt(0)}${data.role.slice(1).toLowerCase()}`
        const setting = await db.siteSetting.findUnique({ where: { key: settingKey } })
        if (setting?.value === 'false') {
          return error(403, `Registration for ${data.role.toLowerCase()}s is currently closed.`)
        }
      }

      // All users (including providers) get ACTIVE status immediately.
      // The dashboard lock mechanism (kycStatus !== APPROVED) restricts
      // providers to only the KYC and Profile sections until verified.
      const status: string = 'ACTIVE'

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
          },
        })
      }

      // Process referral code — link new user to the affiliate who referred them
      // Read from ref_code cookie (30-day, set by /api/affiliate/track) or from signup data
      const c = await cookies()
      const cookieRefCode = c.get('ref_code')?.value
      const refCode = data.referralCode || cookieRefCode

      // Affiliates cannot be referred (no MLM). Admins cannot be referred.
      if (refCode && data.role !== 'AFFILIATE' && data.role !== 'ADMIN') {
        const affiliate = await db.affiliate.findUnique({
          where: { referralCode: refCode },
        })
        // Self-referral prevention: if the new user IS the affiliate, skip
        if (affiliate && affiliate.verified && affiliate.userId !== user.id) {
          // Find the latest CLICKED click from this affiliate and update it
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
            // Create a new click record if none exists (direct signup with code)
            await db.affiliateClick.create({
              data: {
                affiliateId: affiliate.id,
                referredUserId: user.id,
                status: 'SIGNED_UP',
                convertedAt: new Date(),
              },
            })
          }
          // Increment affiliate signup count
          await db.affiliate.update({
            where: { id: affiliate.id },
            data: { totalSignups: { increment: 1 } },
          })

          // If the new user is a provider, link them to the affiliate via referredByAffiliateId
          // This enables automatic affiliate commission attribution on their bookings
          if (['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'].includes(data.role)) {
            await db.user.update({
              where: { id: user.id },
              data: { referredByAffiliateId: affiliate.id, referredAt: new Date() },
            })
          }
        }
        // Clear the ref_code cookie (attribution is complete)
        c.delete('ref_code')
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
      // Revoke any existing sessions — old tokens must not survive a reset.
      await invalidateSessions(user.id)
      return json({ reset: true, verified: true })
    }

    return error(400, 'Invalid purpose.')
  } catch (e) { return handleError(e) }
}
