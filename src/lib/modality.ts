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
 * KNOWN GAP — CLOSED (was: serviceId never sent from patient flow):
 * BookingDialog now fetches the provider's Services, filters them through
 * matchServicesForModality() (active + modality-matched only), auto-selects
 * a single match, offers a sub-choice for multiple matches, and sends the
 * selected serviceId to POST /api/bookings. Zero matches = legacy fallback
 * (no serviceId, Doctor fee fields, NULL-modality permissive path intact
 * per Decision 4). The 422 MODALITY_MISMATCH path is reachable from the UI
 * in the no-service + incompatible-slot case.
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

/**
 * Map a Service.modality value (ServiceModality: CHAT | VIDEO | IN_PERSON —
 * never ONLINE) onto the canonical modality space. Identity for all current
 * values; exists so UI/API code never compares ServiceModality to VisitType
 * ad hoc and so a future ServiceModality member has exactly one place to map.
 */
export function canonicalizeServiceModality(
  m: 'CHAT' | 'VIDEO' | 'IN_PERSON' | null | undefined,
): CanonicalModality | null {
  if (m === 'CHAT' || m === 'VIDEO' || m === 'IN_PERSON') return m
  return null
}

/**
 * Client-side matching of a doctor's classified Services against the
 * modality a patient selected in the booking dialog. Implements the
 * service-matching contract:
 *   - inactive services NEVER match (an inactive Service must not be
 *     auto-selected or offered as a sub-choice, independent of the
 *     booking.create ownership/isActive re-check),
 *   - unclassified (modality NULL — legacy) services NEVER match,
 *   - matching is in canonical space (ServiceModality has no ONLINE).
 * Zero matches = legacy fallback path (no serviceId sent).
 */
export function matchServicesForModality<T extends {
  modality?: 'CHAT' | 'VIDEO' | 'IN_PERSON' | null
  isActive?: boolean
}>(services: readonly T[], modality: CanonicalModality): T[] {
  return services.filter((s) =>
    s.isActive === true &&
    canonicalizeServiceModality(s.modality) === modality,
  )
}
