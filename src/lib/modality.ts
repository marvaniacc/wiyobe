/**
 * Central modality semantics — SINGLE SOURCE OF TRUTH.
 *
 * The database enum `VisitType` historically holds IN_PERSON | ONLINE.
 * Migration Plan v3 (Option B) introduces VIDEO | CHAT | IN_PERSON as the
 * product-level modalities (`ServiceModality`). Historical rows are NEVER
 * rewritten: ONLINE is reinterpreted at runtime as VIDEO.
 *
 * Rules:
 *  - normalizeVisitType maps any stored/requested visit-type value to its
 *    canonical modality: ONLINE -> VIDEO, VIDEO -> VIDEO, CHAT -> CHAT,
 *    IN_PERSON -> IN_PERSON.
 *  - Unknown values are REJECTED (throws ModalityError).
 *
 * Do NOT add scattered `visitType === 'ONLINE' ? 'VIDEO' : ...` mappings
 * elsewhere. Import from this module instead.
 *
 * KNOWN GAP — DOCUMENTED TRANSITIONAL STATE (not a bug):
 * Service.modality validation (422 MODALITY_MISMATCH, bookings route L183-197)
 * is implemented and typechecked but NOT YET wired into the patient booking
 * flow — BookingDialog does not send serviceId, so patient-created bookings
 * never carry a Service and the svc.modality check cannot fire from the UI.
 * No current caller (patient/provider/admin UI, seeds, tests) sends
 * serviceId. Connecting Service selection to patient booking is a deliberate
 * future decision, tracked separately — do not "fix" this silently.
 */

export type CanonicalModality = 'VIDEO' | 'CHAT' | 'IN_PERSON'

/** Raw values accepted on API input (includes legacy ONLINE). */
export const RAW_VISIT_TYPE_VALUES = ['IN_PERSON', 'ONLINE', 'VIDEO', 'CHAT'] as const
export type RawVisitType = (typeof RAW_VISIT_TYPE_VALUES)[number]

export class ModalityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModalityError'
  }
}

const NORMALIZE_MAP: Record<RawVisitType, CanonicalModality> = {
  ONLINE: 'VIDEO',
  VIDEO: 'VIDEO',
  CHAT: 'CHAT',
  IN_PERSON: 'IN_PERSON',
}

export function isRawVisitType(v: unknown): v is RawVisitType {
  return typeof v === 'string' && (RAW_VISIT_TYPE_VALUES as readonly string[]).includes(v)
}

/**
 * Normalize a raw visit-type value into the canonical modality.
 * Throws ModalityError for unknown/null values — callers decide whether to
 * surface that as HTTP 400/422. ONLINE is intentionally accepted forever:
 * it is the historical database representation of VIDEO.
 */
export function normalizeVisitType(raw: unknown): CanonicalModality {
  if (!isRawVisitType(raw)) {
    throw new ModalityError(`Unknown visit type: ${String(raw)}`)
  }
  return NORMALIZE_MAP[raw]
}

/** Safe variant returning null instead of throwing (for display-only paths). */
export function tryNormalizeVisitType(raw: unknown): CanonicalModality | null {
  try { return normalizeVisitType(raw) } catch { return null }
}

/**
 * Zod enum source string, e.g. "'IN_PERSON','ONLINE','VIDEO','CHAT'".
 * Kept here so route schemas never drift from this module.
 */
export const VISIT_TYPE_ZOD_ENUM = ['IN_PERSON', 'ONLINE', 'VIDEO', 'CHAT'] as const

/**
 * DB-level Prisma enum values for Slot.visitType. New writes may persist
 * VIDEO/CHAT directly; ONLINE remains valid for historical rows only.
 */
export function slotFilterForModality(modality: CanonicalModality): string[] {
  switch (modality) {
    case 'VIDEO': return ['VIDEO', 'ONLINE'] // ONLINE is the historical VIDEO
    case 'CHAT': return ['CHAT']
    case 'IN_PERSON': return ['IN_PERSON']
  }
}
