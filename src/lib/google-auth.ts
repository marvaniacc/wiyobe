import { db } from '@/lib/db'
import { setSessionCookie } from '@/lib/auth'
import { json, error } from '@/lib/api'

/**
 * Shared Google sign-in account resolution used by both flows:
 *  - POST /api/auth/google/verify  (GIS idToken)
 *  - GET  /api/auth/callback/google (OAuth authorization code)
 *
 * googleInfo MUST come from a verified source (Google tokeninfo or the
 * token endpoint over TLS) and email_verified must already be true.
 */
export interface GoogleUserInfo {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string | null
  locale?: string
}

export type GoogleAuthResult =
  | { ok: true; user: any; isNewUser: boolean; needsApproval: boolean }
  | { ok: false; status: number; message: string }

export async function resolveGoogleUser(googleInfo: GoogleUserInfo, role: string): Promise<GoogleAuthResult> {
  const googleId = googleInfo.sub
  const email = googleInfo.email.toLowerCase()

  // Existing Google user — log them in
  let user = await db.user.findUnique({ where: { googleId } })
  if (user) {
    if (user.status === 'SUSPENDED') return { ok: false, status: 403, message: 'Your account has been suspended.' }
    if (user.status === 'PENDING') return { ok: false, status: 403, message: 'Your account is pending admin approval.' }
    await setSessionCookie(user.id, user.role)
    return { ok: true, user, isNewUser: false, needsApproval: false }
  }

  // Existing email user — link the Google identity
  user = await db.user.findUnique({ where: { email } })
  if (user) {
    if (user.status === 'SUSPENDED') return { ok: false, status: 403, message: 'Your account has been suspended.' }
    if (user.status === 'PENDING') return { ok: false, status: 403, message: 'Your account is pending admin approval.' }
    await db.user.update({
      where: { id: user.id },
      data: {
        googleId,
        authProvider: user.authProvider === 'password' ? 'google' : user.authProvider,
        emailVerified: user.emailVerified ?? new Date(),
        ...(googleInfo.picture && !user.avatarUrl ? { avatarUrl: googleInfo.picture } : {}),
      },
    })
    await setSessionCookie(user.id, user.role)
    return { ok: true, user, isNewUser: false, needsApproval: false }
  }

  // New user — ACTIVE immediately (same as email/OTP signup): providers
  // enter the dashboard right away and are locked to the KYC + Profile
  // sections (dashboard kycStatus !== APPROVED lock) until admin-approved.
  const status = 'ACTIVE'
  user = await db.user.create({
    data: {
      email,
      googleId,
      authProvider: 'google',
      emailVerified: new Date(),
      role: role as any,
      status: status as any,
      name: googleInfo.name || email.split('@')[0],
      avatarUrl: googleInfo.picture || null,
      preferredLanguage: googleInfo.locale?.startsWith('tr')
        ? 'tr'
        : googleInfo.locale?.startsWith('fa')
          ? 'fa'
          : googleInfo.locale?.startsWith('ar')
            ? 'ar'
            : googleInfo.locale?.startsWith('ru')
              ? 'ru'
              : 'en',
    },
  })

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

  return { ok: true, user, isNewUser: true, needsApproval: false }
}

/** Public config for the login UI. */
export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  return {
    hasGoogle: !!clientId,
    clientId: clientId || null,
  }
}

export { json, error }
