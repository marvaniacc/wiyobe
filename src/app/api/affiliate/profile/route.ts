import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Get affiliate profile
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'AFFILIATE') return error(403, 'Affiliates only')

    let affiliate = await db.affiliate.findUnique({
      where: { userId: session.id },
    })

    // Auto-create affiliate profile if missing
    if (!affiliate) {
      const referralCode = generateReferralCode(session.name || session.email)
      affiliate = await db.affiliate.create({
        data: {
          userId: session.id,
          referralCode,
        },
      })
    }

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { name: true, email: true, phone: true, country: true, city: true, preferredLanguage: true, avatarUrl: true, status: true },
    })

    return json({ affiliate, user })
  } catch (e) { return handleError(e) }
}

const updateSchema = z.object({
  website: z.string().optional(),
  socialMedia: z.string().optional(),
  description: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  preferredLanguage: z.enum(['en', 'tr', 'fa', 'ar', 'ru']).optional(),
})

export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session) return error(401, 'Unauthorized')
    if (session.role !== 'AFFILIATE') return error(403, 'Affiliates only')
    const body = await parseBody(req, updateSchema)

    // Update user fields
    await db.user.update({
      where: { id: session.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.preferredLanguage !== undefined ? { preferredLanguage: body.preferredLanguage } : {}),
      },
    })

    // Update affiliate fields
    let affiliate = await db.affiliate.findUnique({ where: { userId: session.id } })
    if (!affiliate) {
      const referralCode = generateReferralCode(body.name || session.email)
      affiliate = await db.affiliate.create({
        data: { userId: session.id, referralCode },
      })
    }

    affiliate = await db.affiliate.update({
      where: { userId: session.id },
      data: {
        ...(body.website !== undefined ? { website: body.website } : {}),
        ...(body.socialMedia !== undefined ? { socialMedia: body.socialMedia } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    })

    return json({ affiliate })
  } catch (e) { return handleError(e) }
}

function generateReferralCode(name?: string | null): string {
  const prefix = (name || 'AFF').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'AFF'
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `${prefix}${suffix}`
}
