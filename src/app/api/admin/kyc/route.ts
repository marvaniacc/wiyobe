import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/kyc
 *
 * Admin only. Returns providers (DOCTOR, HOSPITAL, HOTEL, TRANSLATOR) who
 * have kycStatus !== 'APPROVED' OR who have KycDocuments with
 * reviewStatus = 'PENDING'. Each provider includes their KYC documents
 * (with requirement info) and the requirements for their provider type.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const providerRoles = ['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']

    // Find providers who are not yet approved OR have pending documents
    const providers = await db.user.findMany({
      where: {
        role: { in: providerRoles },
        OR: [
          { kycStatus: { not: 'APPROVED' } },
          {
            kycDocuments: {
              some: { reviewStatus: 'PENDING' },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        kycStatus: true,
        preferredLanguage: true,
        createdAt: true,
        kycDocuments: {
          orderBy: { uploadedAt: 'desc' },
          include: {
            requirement: {
              select: { id: true, documentName: true, isRequired: true, order: true, type: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // For each provider, also fetch the requirements for their type
    const result = await Promise.all(
      providers.map(async (p) => {
        const requirements = await db.kycRequirement.findMany({
          where: { providerType: p.role },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        })
        return { ...p, requirements }
      })
    )

    return json({ providers: result })
  } catch (e) { return handleError(e) }
}
