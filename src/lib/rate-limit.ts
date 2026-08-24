// Lightweight in-memory sliding-window rate limiter.
// Adequate for this single-process deployment; swap for a shared store
// (e.g. Upstash) if the app ever scales horizontally.

type Bucket = { count: number; resetAt: number }

// Hang the bucket map off globalThis: Next.js (Turbopack) may re-instantiate
// the module per request, which would silently reset any module-level state.
const g = globalThis as unknown as { __rateLimitBuckets?: Map<string, Bucket> }
const buckets: Map<string, Bucket> = g.__rateLimitBuckets ?? (g.__rateLimitBuckets = new Map())

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()

  // Occasional sweep to keep the map bounded.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k)
    }
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  bucket.count += 1
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { ok: true, retryAfterSec: 0 }
}

/** Best-effort client IP.
 *  Behind Cloudflare → Caddy, Caddy overwrites X-Forwarded-For with the
 *  (varying) CF edge IP, so prefer Cloudflare's CF-Connecting-IP, which
 *  carries the real visitor address through the whole chain. */
export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}
