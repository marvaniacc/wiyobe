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
  rates: z.array(z.object({ providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']), rate: z.string() })),
})

export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, updateSchema)
    for (const r of body.rates) {
      await db.commissionRate.upsert({
        where: { providerType: r.providerType },
        update: { rate: r.rate },
        create: { providerType: r.providerType, rate: r.rate },
      })
    }
    const rates = await db.commissionRate.findMany()
    return json({ rates })
  } catch (e) { return handleError(e) }
}
