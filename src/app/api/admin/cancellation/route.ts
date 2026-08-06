import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const policies = await db.cancellationPolicy.findMany()
    return json({ policies })
  } catch (e) { return handleError(e) }
}

const schema = z.object({
  policies: z.array(z.object({
    providerType: z.enum(['DOCTOR', 'HOSPITAL', 'HOTEL', 'TRANSLATOR']),
    freeCancellationHours: z.number().int(),
    cancellationFeePercent: z.string(),
  })),
})

export async function PUT(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')
    const body = await parseBody(req, schema)
    for (const p of body.policies) {
      await db.cancellationPolicy.upsert({
        where: { providerType: p.providerType },
        update: { freeCancellationHours: p.freeCancellationHours, cancellationFeePercent: p.cancellationFeePercent },
        create: p,
      })
    }
    return json({ policies: await db.cancellationPolicy.findMany() })
  } catch (e) { return handleError(e) }
}
