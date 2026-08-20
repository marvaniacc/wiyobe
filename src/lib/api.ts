import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function error(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status })
}

const KNOWN_ERRORS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SLOT_UNAVAILABLE: 409,
}

export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    return error(400, 'Validation error', e.flatten())
  }
  if (e instanceof Error) {
    if (e.message in KNOWN_ERRORS) return error(KNOWN_ERRORS[e.message], e.message.replace(/_/g, ' ').toLowerCase())
    console.error('[api error]', e)
    return error(500, 'Internal server error')
  }
  console.error('[api error]', e)
  return error(500, 'Internal server error')
}

// Safe parse + handle
export async function parseBody<T>(req: Request, schema: { parse: (x: unknown) => T }): Promise<T> {
  const body = await req.json().catch(() => ({}))
  return schema.parse(body)
}
