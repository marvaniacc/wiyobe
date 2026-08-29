/**
 * E2E — Service-to-booking-flow wiring (Migration Plan v3, serviceId path).
 *
 * Exercises POST /api/bookings with the EXACT body shape the patient
 * BookingDialog sends, against a throwaway set of rows in a STAGING/TEST
 * database (never production). Covers:
 *
 *   S1  single matching classified Service  → serviceId auto-selected path:
 *        booking created, amount == Service.price, service linked
 *   S2  multiple matching classified Services → sub-choice path: the body the
 *        UI sends after the patient picks one; amount == chosen Service.price
 *   S3  zero classified Services (legacy doctor) → legacy fallback: NO
 *        serviceId in body, amount == Doctor fee field, booking created
 *   S4  real 422 MODALITY_MISMATCH through the UI body shape: legacy
 *        unclassified service + IN_PERSON slot claimed for a VIDEO booking
 *
 * Prerequisites:
 *   - `bun run scripts/seed-e2e.ts` has run (creates patient/doctor/slots).
 *   - The script's own fixtures are created and cleaned up by this script.
 *
 * Run: bun run scripts/e2e-modality.ts <baseUrl>
 *   e.g. bun run scripts/e2e-modality.ts http://localhost:3011
 */

import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

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
    headers: {
      'Content-Type': 'application/json',
      ...(ctx ? { Cookie: ctx.cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json: any = null
  try { json = await res.json() } catch { /* empty body (204 etc.) */ }
  return { status: res.status, json }
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

async function main() {
  console.log(`\n🧪 e2e-modality against ${BASE}\n`)

  // =========================================================================
  // FIXTURES — patient, three doctors, slots, classified services
  // =========================================================================
  const stamp = Date.now().toString(36)

  const patientUser = await db.user.upsert({
    where: { email: `e2emodality-patient-${stamp}@test.local` },
    update: {},
    create: {
      email: `e2emodality-patient-${stamp}@test.local`,
      passwordHash: hashPassword('test1234'),
      role: 'PATIENT', status: 'ACTIVE', name: 'E2E Modality Patient', preferredLanguage: 'en',
    },
  })
  await db.patient.upsert({
    where: { userId: patientUser.id },
    update: {},
    create: { userId: patientUser.id },
  })

  // D1: exactly ONE classified VIDEO service (single-match/auto-select case)
  // D2: TWO classified VIDEO services (multi-match/sub-choice case)
  // D3: NO classified services (legacy fallback + 422 mismatch case)
  const doctorSpecs = [
    { key: 'd1', email: `e2emodality-d1-${stamp}@test.local`, services: [{ name: 'Video Cardiology', price: '55.50', modality: 'VIDEO' as const, isActive: true }] },
    { key: 'd2', email: `e2emodality-d2-${stamp}@test.local`, services: [
      { name: 'Video Basic', price: '40.00', modality: 'VIDEO' as const, isActive: true },
      { name: 'Video Extended', price: '90.00', modality: 'VIDEO' as const, isActive: true },
    ] },
    { key: 'd3', email: `e2emodality-d3-${stamp}@test.local`, services: [] as { name: string; price: string; modality: 'VIDEO'; isActive: boolean }[] },
  ]

  const doctorIds: Record<string, string> = {}
  const serviceIds: Record<string, string[]> = {}
  const slotIds: Record<string, string> = {}
  const inPersonSlotIds: Record<string, string> = {}

  for (const spec of doctorSpecs) {
    const u = await db.user.upsert({
      where: { email: spec.email },
      update: {},
      create: {
        email: spec.email, passwordHash: hashPassword('test1234'),
        role: 'DOCTOR', status: 'ACTIVE', name: `E2E Doctor ${spec.key.toUpperCase()}`, preferredLanguage: 'en',
      },
    })
    await db.doctor.deleteMany({ where: { userId: u.id } })
    const d = await db.doctor.create({
      data: {
        userId: u.id, specialty: 'E2E', subSpecialties: '', bio: '', city: 'Test', country: 'Test',
        yearsExperience: 1, consultationFee: '100', onlineFee: '80',
        languages: 'en', education: '', certifications: '', verified: true, rating: 0, reviewCount: 0,
      },
    })
    doctorIds[spec.key] = d.id
    serviceIds[spec.key] = []
    for (const s of spec.services) {
      const svc = await db.service.create({
        data: {
          name: s.name, description: `E2E fixture ${spec.key}`, price: s.price, currency: 'USD',
          providerType: 'DOCTOR', doctorId: d.id, modality: s.modality, isActive: s.isActive,
        },
      })
      serviceIds[spec.key].push(svc.id)
    }
    const slot = await db.slot.create({
      data: { doctorId: d.id, startTime: new Date(Date.now() + 5 * 86400_000), endTime: new Date(Date.now() + 5 * 86400_000 + 1800_000), visitType: 'VIDEO', isBooked: false },
    })
    slotIds[spec.key] = slot.id
    // An explicit IN_PERSON slot for D3 — the 422 mismatch trigger.
    const ipSlot = await db.slot.create({
      data: { doctorId: d.id, startTime: new Date(Date.now() + 6 * 86400_000), endTime: new Date(Date.now() + 6 * 86400_000 + 1800_000), visitType: 'IN_PERSON', isBooked: false },
    })
    inPersonSlotIds[spec.key] = ipSlot.id
  }

  // Dedicated slot for S5 (never touched by the success scenarios).
  const s5Slot = await db.slot.create({
    data: { doctorId: doctorIds.d1, startTime: new Date(Date.now() + 7 * 86400_000), endTime: new Date(Date.now() + 7 * 86400_000 + 1800_000), visitType: 'VIDEO', isBooked: false },
  })
  const s5SlotId = s5Slot.id
  // Dedicated slot for S6 — S2 books D2's main slot, so S6 gets its own.
  const s6Slot = await db.slot.create({
    data: { doctorId: doctorIds.d2, startTime: new Date(Date.now() + 7 * 86400_000), endTime: new Date(Date.now() + 7 * 86400_000 + 1800_000), visitType: 'VIDEO', isBooked: false },
  })
  const s6SlotId = s6Slot.id

  const patient = await login(`e2emodality-patient-${stamp}@test.local`, 'test1234')

  // UI body shape: { providerType, providerId, slotId, visitType, startDate, notes } (+ serviceId when selected)
  const uiBody = (doctorId: string, slotId: string | undefined, visitType: string, serviceId?: string) => ({
    providerType: 'DOCTOR',
    providerId: doctorId,
    ...(serviceId ? { serviceId } : {}),
    ...(slotId ? { slotId } : {}),
    visitType,
    startDate: new Date(Date.now() + 5 * 86400_000).toISOString(),
    notes: 'e2e-modality',
  })

  // =========================================================================
  console.log('━━━ S1: single matching classified service → auto-selected serviceId')
  {
    const [svcId] = serviceIds.d1
    const r = await api(patient, 'POST', '/api/bookings', uiBody(doctorIds.d1, slotIds.d1, 'VIDEO', svcId))
    check('HTTP 200/201', r.status === 200 || r.status === 201, `got ${r.status} ${JSON.stringify(r.json)}`)
    const b = r.json?.booking
    check('booking has serviceId', b?.serviceId === svcId, `serviceId=${b?.serviceId}`)
    check('amount == Service.price (55.50)', b?.amount === '55.50', `amount=${b?.amount}`)
    check('visitType persisted as VIDEO', b?.visitType === 'VIDEO', `visitType=${b?.visitType}`)
    check('service included with price', r.json?.booking?.service?.price === '55.50')
  }

  // =========================================================================
  console.log('━━━ S2: multiple matching services → sub-choice: patient-picked serviceId')
  {
    const [, svcId2] = serviceIds.d2 // patient picks "Video Extended" ($90.00)
    const r = await api(patient, 'POST', '/api/bookings', uiBody(doctorIds.d2, slotIds.d2, 'VIDEO', svcId2))
    check('HTTP 200/201', r.status === 200 || r.status === 201, `got ${r.status} ${JSON.stringify(r.json)}`)
    const b = r.json?.booking
    check('booking carries the picked service', b?.serviceId === svcId2, `serviceId=${b?.serviceId}`)
    check('amount == picked Service.price (90.00)', b?.amount === '90.00', `amount=${b?.amount}`)
  }

  // =========================================================================
  console.log('━━━ S3: zero classified services → legacy fallback (NO serviceId)')
  {
    const r = await api(patient, 'POST', '/api/bookings', uiBody(doctorIds.d3, slotIds.d3, 'VIDEO'))
    check('HTTP 200/201', r.status === 200 || r.status === 201, `got ${r.status} ${JSON.stringify(r.json)}`)
    const b = r.json?.booking
    check('no serviceId on booking', !b?.serviceId, `serviceId=${b?.serviceId}`)
    // Server normalizes amounts through toDec → two decimals ('80' → '80.00')
    check('amount == legacy Doctor.onlineFee (80.00)', b?.amount === '80.00', `amount=${b?.amount}`)
  }

  // =========================================================================
  console.log('━━━ S4: real 422 MODALITY_MISMATCH via UI body shape')
  {
    // Legacy (unclassified) service exists on D3? — no services at all; use
    // the no-serviceId + incompatible-slot path: VIDEO booking claiming an
    // IN_PERSON slot → server must 422 and NOT consume the slot.
    const r = await api(patient, 'POST', '/api/bookings', uiBody(doctorIds.d3, inPersonSlotIds.d3, 'VIDEO'))
    check('HTTP 422', r.status === 422, `got ${r.status} ${JSON.stringify(r.json)}`)
    check('error == MODALITY_MISMATCH', r.json?.error === 'MODALITY_MISMATCH', `error=${r.json?.error}`)
    check('details present', typeof r.json?.details === 'string' && r.json.details.length > 0)
    const slotAfter = await db.slot.findUnique({ where: { id: inPersonSlotIds.d3 }, select: { isBooked: true } })
    check('slot NOT consumed on mismatch', slotAfter?.isBooked === false)
  }

  // =========================================================================
  console.log('━━━ S5 (defense): classified service + wrong-modality request → 422, slot intact')
  {
    // D1's classified VIDEO service + a CHAT request: the service-modality
    // check fires BEFORE any slot claim, so D1's dedicated S5 slot must still
    // be free afterwards. (Do NOT reuse S1's slot — S1 booked it.)
    const [svcId] = serviceIds.d1
    const r = await api(patient, 'POST', '/api/bookings', uiBody(doctorIds.d1, s5SlotId, 'CHAT', svcId))
    check('HTTP 422', r.status === 422, `got ${r.status} ${JSON.stringify(r.json)}`)
    check('error == MODALITY_MISMATCH', r.json?.error === 'MODALITY_MISMATCH', `error=${r.json?.error}`)
    const slotAfter = await db.slot.findUnique({ where: { id: s5SlotId }, select: { isBooked: true } })
    check('slot NOT consumed on mismatch', slotAfter?.isBooked === false)
  }

  // =========================================================================
  console.log('━━━ S6 (defense-in-depth): multi-match + NO serviceId via direct API → 400')
  {
    // D2 has TWO active VIDEO services. The UI disables Continue until the
    // patient picks one; a direct API call with no serviceId must NOT
    // silently fall back to the legacy fee — it gets a clear 400 instead.
    // (Zero-match D3 stays permissive, and single-match D1 auto-selects.)
    const r = await api(patient, 'POST', '/api/bookings', uiBody(doctorIds.d2, s6SlotId, 'VIDEO'))
    check('HTTP 400 (not silent legacy fallback)', r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`)
    check('error == SERVICE_CHOICE_REQUIRED', r.json?.error === 'SERVICE_CHOICE_REQUIRED', `error=${r.json?.error}`)
    const slotAfter = await db.slot.findUnique({ where: { id: s6SlotId }, select: { isBooked: true } })
    check('slot NOT consumed', slotAfter?.isBooked === false)
  }

  // =========================================================================
  // CLEANUP — remove everything this script created (bookings first, then
  // dependents, then fixtures). Never touches production data.
  // =========================================================================
  console.log('━━━ cleanup')
  const emails = doctorSpecs.map((s) => s.email).concat([`e2emodality-patient-${stamp}@test.local`])
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } })
  const userIds = users.map((u) => u.id)
  const bookings = await db.booking.findMany({ where: { patientId: userIds[0] }, select: { id: true } })
  for (const b of bookings) {
    await db.ledgerEntry.deleteMany({ where: { bookingId: b.id } })
    await db.payment.deleteMany({ where: { bookingId: b.id } })
    await db.review.deleteMany({ where: { bookingId: b.id } })
  }
  await db.booking.deleteMany({ where: { patientId: userIds[0] } })
  for (const key of Object.keys(doctorIds)) {
    await db.slot.deleteMany({ where: { doctorId: doctorIds[key] } })
    await db.service.deleteMany({ where: { doctorId: doctorIds[key] } })
    await db.doctor.deleteMany({ where: { id: doctorIds[key] } })
  }
  await db.session.deleteMany({ where: { userId: { in: userIds } } })
  await db.patient.deleteMany({ where: { userId: userIds[0] } })
  await db.user.deleteMany({ where: { id: { in: userIds } } })
  console.log('  fixtures removed')

  // =========================================================================
  console.log('')
  if (failures > 0) {
    console.error(`❌ ${failures} check(s) FAILED`)
    process.exit(1)
  }
  console.log('✅ all e2e-modality checks passed')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ e2e failed:', e)
    process.exit(1)
  })
