/**
 * E2E — Jitsi room privacy: Option A (CSPRNG room names) + Option B (gated join).
 *
 * Exercises the video-join flow against a STAGING/TEST database (never
 * production). Covers the three required guarantees:
 *
 *   V1  Unauthorized user CANNOT obtain a valid room URL
 *       (no session → 401; unrelated authenticated user → 403; bad token → 403)
 *   V2  Authorized users (patient, provider, admin) CAN obtain the room URL
 *       (JSON mode, redirect mode, and token round-trip)
 *   V3  Expired token is rejected (401) — token crafted with a past expiry but
 *       a VALID signature, proving expiry is enforced independently of signature;
 *       plus tampered-signature → 403 and wrong-booking-binding → 403
 *
 * Also verifies Option A: a newly created VIDEO booking's room URL is
 * high-entropy CSPRNG (wishubest- + 32 hex), NOT derived from the booking id.
 *
 * Prerequisites:
 *   - A dev server with DATABASE_URL pointing at the STAGING database and
 *     AUTH_SECRET set, e.g.:
 *       DATABASE_URL=...wiyobe_staging... AUTH_SECRET=<dev secret> npx next dev -p 3011
 *   - No seed required — fixtures are created and cleaned up by this script.
 *
 * Run: bun run scripts/e2e-video-join.ts <baseUrl>
 *   e.g. bun run scripts/e2e-video-join.ts http://localhost:3011
 */

import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'
import crypto from 'crypto'

const BASE = process.argv[2] || 'http://localhost:3011'

interface Ctx { cookie: string }

let failures = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✅ ${name}`)
  } else {
    failures++
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function api(ctx: Ctx | null, method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(ctx ? { Cookie: ctx.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json: any = null
  try { json = await res.json() } catch { /* redirect / empty body */ }
  return { status: res.status, json, headers: res.headers }
}

async function login(email: string, password: string): Promise<Ctx> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`signin failed for ${email}: HTTP ${res.status}`)
  const setCookie = res.headers.get('set-cookie') || ''
  const m = setCookie.match(/mt_session=([^;]+)/)
  if (!m) throw new Error(`no mt_session cookie for ${email}`)
  return { cookie: `mt_session=${m[1]}` }
}

// Craft a token with the SAME scheme as src/lib/video-token.ts, but with a
// chosen expiry — lets us exercise the real /video/join verification path
// for an expired-but-validly-signed token.
function craftToken(bookingId: string, expiresAtMs: number, secret: string): string {
  const payload = { b: bookingId, i: Date.now(), x: expiresAtMs, n: crypto.randomBytes(8).toString('hex') }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
  const mac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${mac}`
}

async function main() {
  console.log(`\n🧪 e2e-video-join against ${BASE}\n`)
  const stamp = Date.now().toString(36)
  const password = 'test1234'

  // =========================================================================
  // FIXTURES — patient, doctor (VIDEO service + slots), outsider, admin
  // =========================================================================
  const patientUser = await db.user.create({
    data: {
      email: `e2evideo-patient-${stamp}@test.local`, passwordHash: hashPassword(password),
      role: 'PATIENT', status: 'ACTIVE', name: 'E2E Video Patient', preferredLanguage: 'en',
    },
  })
  await db.patient.create({ data: { userId: patientUser.id } })

  const doctorUser = await db.user.create({
    data: {
      email: `e2evideo-doctor-${stamp}@test.local`, passwordHash: hashPassword(password),
      role: 'DOCTOR', status: 'ACTIVE', name: 'E2E Video Doctor', preferredLanguage: 'en',
    },
  })
  const doctorRow = await db.doctor.create({
    data: {
      userId: doctorUser.id, specialty: 'E2E', subSpecialties: '', bio: '', city: 'Test', country: 'Test',
      yearsExperience: 1, consultationFee: '100', onlineFee: '80',
      languages: 'en', education: '', certifications: '', verified: true, rating: 0, reviewCount: 0,
    },
  })
  const service = await db.service.create({
    data: {
      name: 'E2E Video Consult', description: 'e2e-video-join fixture', price: '50.00', currency: 'USD',
      providerType: 'DOCTOR', doctorId: doctorRow.id, modality: 'VIDEO', isActive: true,
    },
  })
  const slot = await db.slot.create({
    data: {
      doctorId: doctorRow.id, startTime: new Date(Date.now() + 5 * 86400_000), endTime: new Date(Date.now() + 5 * 86400_000 + 1800_000),
      visitType: 'VIDEO', isBooked: false,
    },
  })

  const outsiderUser = await db.user.create({
    data: {
      email: `e2evideo-outsider-${stamp}@test.local`, passwordHash: hashPassword(password),
      role: 'PATIENT', status: 'ACTIVE', name: 'E2E Video Outsider', preferredLanguage: 'en',
    },
  })
  await db.patient.create({ data: { userId: outsiderUser.id } })

  const adminUser = await db.user.create({
    data: {
      email: `e2evideo-admin-${stamp}@test.local`, passwordHash: hashPassword(password),
      role: 'ADMIN', status: 'ACTIVE', name: 'E2E Video Admin', preferredLanguage: 'en',
    },
  })

  const patientCtx = await login(`e2evideo-patient-${stamp}@test.local`, password)
  const doctorCtx = await login(`e2evideo-doctor-${stamp}@test.local`, password)
  const outsiderCtx = await login(`e2evideo-outsider-${stamp}@test.local`, password)
  const adminCtx = await login(`e2evideo-admin-${stamp}@test.local`, password)

  const bookingIds: string[] = []
  const extraSlotIds: string[] = []
  try {
    // =======================================================================
    console.log('━━━ V0: VIDEO booking creation produces a high-entropy room URL (Option A)')
    {
      const r = await api(patientCtx, 'POST', '/api/bookings', {
        providerType: 'DOCTOR',
        providerId: doctorRow.id,
        serviceId: service.id,
        slotId: slot.id,
        visitType: 'VIDEO',
        startDate: new Date(Date.now() + 5 * 86400_000).toISOString(),
        notes: 'e2e-video-join',
      })
      check('booking created (HTTP 200/201)', r.status === 200 || r.status === 201, `got ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`)
      const b = r.json?.booking
      const bookingId: string | undefined = b?.id
      if (bookingId) bookingIds.push(bookingId)
      const url: string | null = b?.videoSessionUrl ?? null
      check('videoSessionUrl present', !!url, `got ${url}`)
      const m = url ? url.match(/^https:\/\/meet\.jit\.si\/wishubest-([0-9a-f]{32})$/) : null
      check('room name is wishubest-<32 hex> (128-bit CSPRNG)', !!m, `url=${url}`)
      check('room name NOT derived from booking id', !!url && !!bookingId && !url.includes(bookingId.slice(-8)), `id8=${bookingId?.slice(-8)}`)

      // Second VIDEO booking → different room (uniqueness sanity)
      const slot2 = await db.slot.create({
        data: { doctorId: doctorRow.id, startTime: new Date(Date.now() + 8 * 86400_000), endTime: new Date(Date.now() + 8 * 86400_000 + 1800_000), visitType: 'VIDEO', isBooked: false },
      })
      extraSlotIds.push(slot2.id)
      const r2 = await api(patientCtx, 'POST', '/api/bookings', {
        providerType: 'DOCTOR', providerId: doctorRow.id, serviceId: service.id, slotId: slot2.id, visitType: 'VIDEO',
        startDate: new Date(Date.now() + 8 * 86400_000).toISOString(), notes: 'e2e-video-join-2',
      })
      const url2: string | undefined = r2.json?.booking?.videoSessionUrl
      check('second booking gets a DIFFERENT room name', !!url2 && url2 !== url, `url2=${url2}`)
      if (r2.json?.booking?.id) bookingIds.push(r2.json.booking.id)
    }

    const mainBookingId = bookingIds[0]
    const joinPath = (id: string) => `/api/bookings/${id}/video/join`

    // =======================================================================
    console.log('━━━ V1: unauthorized users cannot obtain the room URL')
    {
      const anon = await api(null, 'GET', joinPath(mainBookingId))
      check('no session → 401', anon.status === 401, `got ${anon.status}`)

      const other = await api(outsiderCtx, 'GET', joinPath(mainBookingId))
      check('unrelated authenticated user → 403', other.status === 403, `got ${other.status}`)
      check('403 body carries no URL', !JSON.stringify(other.json ?? {}).includes('meet.jit.si'))

      const badTok = await api(patientCtx, 'GET', `${joinPath(mainBookingId)}?token=garbage.sig`)
      check('garbage token → 403', badTok.status === 403, `got ${badTok.status}`)
    }

    console.log('━━━ V2: authorized users CAN obtain the room URL (JSON + token + redirect)')
    {
      const p = await api(patientCtx, 'GET', joinPath(mainBookingId))
      check('patient → 200', p.status === 200, `got ${p.status} ${JSON.stringify(p.json).slice(0, 200)}`)
      const stored = await db.booking.findUnique({ where: { id: mainBookingId } })
      check('URL matches stored room URL', p.json?.url === stored?.videoSessionUrl, `api=${p.json?.url}`)
      check('joinToken present', typeof p.json?.joinToken === 'string' && p.json.joinToken.length > 20)
      const expMs = p.json?.tokenExpiresAt ? new Date(p.json.tokenExpiresAt).getTime() : 0
      check('tokenExpiresAt ~5min ahead', expMs >= Date.now() + 4 * 60_000 && expMs <= Date.now() + 6 * 60_000, `exp=${p.json?.tokenExpiresAt}`)

      const d = await api(doctorCtx, 'GET', joinPath(mainBookingId))
      check('provider → 200', d.status === 200, `got ${d.status}`)

      const a = await api(adminCtx, 'GET', joinPath(mainBookingId))
      check('admin → 200', a.status === 200, `got ${a.status}`)

      const joinToken: string = p.json?.joinToken || ''
      const rt = await api(patientCtx, 'GET', `${joinPath(mainBookingId)}?token=${encodeURIComponent(joinToken)}`)
      check('token round-trip accepted → 200', rt.status === 200, `got ${rt.status}`)

      const red = await api(patientCtx, 'GET', `${joinPath(mainBookingId)}?redirect=1`)
      check('redirect=1 → 302', red.status === 302, `got ${red.status}`)
      const loc = red.headers.get('location') || ''
      check('redirect Location == room URL', loc === stored?.videoSessionUrl, `loc=${loc}`)
    }

    console.log('━━━ V3: expired / tampered / wrong-binding tokens rejected')
    {
      const secret = process.env.AUTH_SECRET || ''
      check('fixture sanity: AUTH_SECRET set for token crafting', secret.length >= 32)

      const expired = craftToken(mainBookingId, Date.now() - 1000, secret)
      const er = await api(patientCtx, 'GET', `${joinPath(mainBookingId)}?token=${encodeURIComponent(expired)}`)
      check('expired (validly signed) token → 401', er.status === 401, `got ${er.status} ${JSON.stringify(er.json)}`)

      const future = craftToken(mainBookingId, Date.now() + 60_000, secret)
      const [pb64] = future.split('.')
      const forged = `${pb64}.${crypto.createHmac('sha256', 'wrong-secret').update(pb64).digest('base64url')}`
      const fr = await api(patientCtx, 'GET', `${joinPath(mainBookingId)}?token=${encodeURIComponent(forged)}`)
      check('tampered token → 403', fr.status === 403, `got ${fr.status}`)

      const other = craftToken('bogus-booking-id', Date.now() + 60_000, secret)
      const or = await api(patientCtx, 'GET', `${joinPath(mainBookingId)}?token=${encodeURIComponent(other)}`)
      check('token bound to another booking → 403', or.status === 403, `got ${or.status}`)
    }
  } finally {
    // =======================================================================
    console.log('━━━ cleanup')
    try {
      for (const bid of bookingIds) {
        await db.ledgerEntry.deleteMany({ where: { bookingId: bid } })
        await db.payment.deleteMany({ where: { bookingId: bid } })
        await db.review.deleteMany({ where: { bookingId: bid } })
        await db.chatMessage.deleteMany({ where: { bookingId: bid } }).catch(() => {})
        await db.booking.deleteMany({ where: { id: bid } })
      }
      await db.service.deleteMany({ where: { doctorId: doctorRow.id } })
      await db.slot.deleteMany({ where: { doctorId: doctorRow.id } })
      await db.doctor.deleteMany({ where: { id: doctorRow.id } })
      await db.session.deleteMany({ where: { userId: { in: [patientUser.id, doctorUser.id, outsiderUser.id, adminUser.id] } } })
      await db.patient.deleteMany({ where: { userId: { in: [patientUser.id, outsiderUser.id] } } })
      await db.user.deleteMany({ where: { id: { in: [patientUser.id, doctorUser.id, outsiderUser.id, adminUser.id] } } })
    } catch (e) {
      console.error('cleanup error:', e)
      failures++
    }
  }

  console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED\n' : `\n❌ ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
