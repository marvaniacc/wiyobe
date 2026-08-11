import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'
import { sendNotification } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const approveSchema = z.object({
  userId: z.string(),
})

/**
 * POST /api/admin/kyc/approve-user
 *
 * Admin only. Approves the overall KYC status for a provider.
 *
 * Validates that ALL required documents for the user's role are APPROVED.
 * If any required document is missing or not approved, returns a 400 error
 * with a list of what's still pending.
 *
 * On success, updates User.kycStatus to 'APPROVED' and sends a notification.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { userId } = await parseBody(req, approveSchema)

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, kycStatus: true },
    })
    if (!user) return error(404, 'User not found')
    if (!['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR'].includes(user.role)) {
      return error(400, 'User is not a provider')
    }

    // Fetch all required requirements for this provider type
    const requirements = await db.kycRequirement.findMany({
      where: { providerType: user.role, isRequired: true },
    })

    // Fetch the user's documents
    const documents = await db.kycDocument.findMany({
      where: { userId },
    })

    // Check each required document is approved
    const pending: string[] = []
    for (const req of requirements) {
      const doc = documents.find((d) => d.requirementId === req.id)
      if (!doc) {
        pending.push(req.documentName + ' (not uploaded)')
      } else if (doc.reviewStatus !== 'APPROVED') {
        pending.push(req.documentName + ` (${doc.reviewStatus.toLowerCase()})`)
      }
    }

    if (pending.length > 0) {
      return error(400, `Cannot approve: ${pending.length} required document(s) not approved: ${pending.join(', ')}`)
    }

    // All required documents are approved — approve the user's KYC
    await db.user.update({
      where: { id: userId },
      data: { kycStatus: 'APPROVED' },
    })

    // Send notification
    await sendNotification({
      userId,
      title: 'KYC Verification Complete',
      message: 'Your account is now fully verified. You can access all features.',
      category: 'KYC',
      type: 'kyc_approved',
      link: 'overview',
    })

    return json({ ok: true, message: 'Provider KYC approved successfully' })
  } catch (e) { return handleError(e) }
}
