import { error, handleError, json } from '@/lib/api'
import { expirePaymentHolds } from '@/lib/payment-holds'

export const dynamic = 'force-dynamic'

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: Request) {
  try {
    if (!isAuthorized(req)) return error(401, 'Unauthorized')
    const expired = await expirePaymentHolds()
    return json({ expired })
  } catch (e) { return handleError(e) }
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
