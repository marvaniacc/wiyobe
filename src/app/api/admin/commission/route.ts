import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const rates = await db.commissionRate.findMany()
    return json({ rates })
  } catch (e) { return handleError(e) }
}

const updateSchema = z.object({
  rates: z.array(z.object({
    providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
    rate: z.string().optional(),
    affiliateRate: z.string().optional(),
  })),
})

export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, updateSchema)
    for (const r of body.rates) {
      // Build update data with only the fields that are provided
      const updateData: any = {}
      if (r.rate !== undefined) updateData.rate = r.rate
      if (r.affiliateRate !== undefined) updateData.affiliateRate = r.affiliateRate

      const existing = await db.commissionRate.findUnique({ where: { providerType: r.providerType } })
      if (existing) {
        await db.commissionRate.update({
          where: { providerType: r.providerType },
          data: updateData,
        })
      } else {
        await db.commissionRate.create({
          data: {
            providerType: r.providerType,
            rate: r.rate || '0',
            affiliateRate: r.affiliateRate || '0',
          },
        })
      }
    }
    const rates = await db.commissionRate.findMany()
    return json({ rates })
  } catch (e) { return handleError(e) }
}
