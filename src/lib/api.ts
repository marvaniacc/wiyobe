import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function error(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status })
}

export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    return error(400, 'Validation error', e.flatten())
  }
  if (e instanceof Error) {
    if (e.message === 'UNAUTHORIZED') return error(401, 'Unauthorized')
    if (e.message === 'FORBIDDEN') return error(403, 'Forbidden')
    if (e.message === 'NOT_FOUND') return error(404, 'Not found')
    console.error('[api error]', e)
    return error(500, e.message)
  }
  console.error('[api error]', e)
  return error(500, 'Internal server error')
}

// Safe parse + handle
export async function parseBody<T>(req: Request, schema: { parse: (x: unknown) => T }): Promise<T> {
  const body = await req.json().catch(() => ({}))
  return schema.parse(body)
}
