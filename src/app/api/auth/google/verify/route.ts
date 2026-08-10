import { db } from '@/lib/db'
import { setSessionCookie } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  // Google ID token (from GIS) OR demo email when no Google credentials configured
  idToken: z.string().optional(),
  demoEmail: z.string().email().optional(),
  demoName: z.string().optional(),
  role: z.enum(['PATIENT', 'DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']).default('PATIENT'),
})

interface GoogleUserInfo {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string | null
  locale?: string
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserInfo | null> {
  // Verify the ID token using Google's tokeninfo endpoint
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Verify audience matches our client ID if configured
    if (process.env.GOOGLE_CLIENT_ID && data.aud !== process.env.GOOGLE_CLIENT_ID) {
      return null
    }
    return {
      sub: data.sub,
      email: data.email,
      email_verified: data.email_verified === 'true' || data.email_verified === true,
      name: data.name,
      picture: data.picture,
      locale: data.locale,
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema)

    let googleInfo: GoogleUserInfo | null = null
    let isDemo = false

    if (body.idToken) {
      // Real Google OAuth flow
      googleInfo = await verifyGoogleIdToken(body.idToken)
      if (!googleInfo || !googleInfo.email) {
        return error(401, 'Google authentication failed. Invalid or expired token.')
      }
    } else if (body.demoEmail && process.env.NODE_ENV !== 'production') {
      // Demo mode — ONLY available in non-production environments for development/testing.
      // In production, demoEmail is ignored entirely to prevent authentication bypass.
      isDemo = true
      googleInfo = {
        sub: `demo_${Buffer.from(body.demoEmail).toString('hex')}`,
        email: body.demoEmail,
        email_verified: true,
        name: body.demoName || body.demoEmail.split('@')[0],
        picture: null,
        locale: 'en',
      }
    } else if (body.demoEmail && process.env.NODE_ENV === 'production') {
      // Reject demoEmail in production — this is a security measure to prevent
      // authentication bypass by impersonating any email address.
      return error(403, 'Demo authentication is not available in production.')
    } else {
      return error(400, 'Either idToken or demoEmail is required.')
    }

    // Defensive guard — after the branches above, googleInfo must be set (all
    // failing paths return early). This satisfies the type-checker.
    if (!googleInfo) return error(500, 'Authentication state error')

    const googleId = googleInfo.sub
    const email = googleInfo.email.toLowerCase()

    // Check if a user with this Google ID already exists
    let user = await db.user.findUnique({ where: { googleId } })

    if (user) {
      // Existing Google user — log them in
      if (user.status === 'SUSPENDED') return error(403, 'Your account has been suspended.')
      if (user.status === 'PENDING') return error(403, 'Your account is pending admin approval.')
      await setSessionCookie(user.id, user.role)
      return json({
        user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage },
        isNewUser: false,
        demo: isDemo,
      })
    }

    // Check if a user with this email exists (link accounts)
    user = await db.user.findUnique({ where: { email } })
    if (user) {
      // Link the Google ID to the existing account
      await db.user.update({
        where: { id: user.id },
        data: {
          googleId,
          authProvider: user.authProvider === 'password' ? 'google' : user.authProvider,
          emailVerified: user.emailVerified ?? new Date(),
          ...(googleInfo.picture && !user.avatarUrl ? { avatarUrl: googleInfo.picture } : {}),
        },
      })
      if (user.status === 'SUSPENDED') return error(403, 'Your account has been suspended.')
      if (user.status === 'PENDING') return error(403, 'Your account is pending admin approval.')
      await setSessionCookie(user.id, user.role)
      return json({
        user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage },
        isNewUser: false,
        demo: isDemo,
      })
    }

    // New user — create account via Google. Patients are active immediately; providers pending.
    const role = body.role
    const status = role === 'PATIENT' ? 'ACTIVE' : 'PENDING'

    user = await db.user.create({
      data: {
        email,
        googleId,
        authProvider: 'google',
        emailVerified: new Date(),
        role,
        status: status as any,
        name: googleInfo.name || email.split('@')[0],
        avatarUrl: googleInfo.picture || null,
        preferredLanguage: googleInfo.locale?.startsWith('tr') ? 'tr' : googleInfo.locale?.startsWith('fa') ? 'fa' : googleInfo.locale?.startsWith('ar') ? 'ar' : 'en',
      },
    })

    // Create role-specific profile
    if (role === 'PATIENT') {
      await db.patient.create({ data: { userId: user.id } })
    } else if (role === 'DOCTOR') {
      await db.doctor.create({
        data: { userId: user.id, specialty: 'General', subSpecialties: '', bio: '', city: '', country: '', yearsExperience: 0, consultationFee: '0', onlineFee: '0', languages: user.preferredLanguage, education: '', certifications: '', verified: false },
      })
    } else if (role === 'HOSPITAL') {
      await db.hospital.create({
        data: { userId: user.id, name: user.name || 'New Hospital', description: '', address: '', city: '', country: '', departments: '', accreditations: '', beds: 0, baseFee: '0', languages: user.preferredLanguage, verified: false },
      })
    } else if (role === 'HOTEL') {
      await db.hotel.create({
        data: { userId: user.id, name: user.name || 'New Hotel', description: '', address: '', city: '', country: '', starRating: 3, amenities: '', roomTypes: '', pricePerNight: '0', languages: user.preferredLanguage, verified: false },
      })
    } else if (role === 'TRANSLATOR') {
      await db.translator.create({
        data: { userId: user.id, languages: user.preferredLanguage, specialization: 'general', bio: '', city: '', country: '', hourlyRate: '0', dailyRate: '0', yearsExperience: 0, verified: false },
      })
    }

    if (status === 'ACTIVE') {
      await setSessionCookie(user.id, user.role)
    }

    return json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name, status: user.status, preferredLanguage: user.preferredLanguage },
      isNewUser: true,
      needsApproval: status === 'PENDING',
      demo: isDemo,
    }, 201)
  } catch (e) { return handleError(e) }
}
