// Money helpers — all amounts stored as decimal strings ("12.34").
// All arithmetic is performed in integer cents to avoid float rounding
// errors. Values are converted to cents on the way in and back to decimal
// strings on the way out, so callers keep working with the same string API.

// Parse a decimal string/number into integer cents. Returns NaN on garbage.
function toCents(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const s = typeof v === 'number' ? String(v) : String(v).trim()
  if (s === '0' || s === '-0') return 0
  const neg = s.startsWith('-')
  const abs = neg ? s.slice(1) : s
  const [whole, frac = ''] = abs.split('.')
  const w = parseInt(whole, 10)
  const f = parseInt((frac + '00').slice(0, 2).padEnd(2, '0'), 10)
  if (!Number.isFinite(w)) return NaN
  const cents = w * 100 + f
  return neg ? -cents : cents
}

// Format integer cents back to a fixed 2-decimal string.
function fromCents(cents: number): string {
  if (!Number.isFinite(cents)) return '0.00'
  const neg = cents < 0
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  return `${neg ? '-' : ''}${whole}.${String(frac).padStart(2, '0')}`
}

export function toDec(n: number | string | null | undefined): string {
  const c = toCents(n)
  return Number.isNaN(c) ? '0.00' : fromCents(c)
}

export function addDec(...vals: (string | number | null | undefined)[]): string {
  let sum = 0
  for (const v of vals) {
    const c = toCents(v)
    if (Number.isNaN(c)) return '0.00'
    sum += c
  }
  return fromCents(sum)
}

export function subDec(a: string | number | null | undefined, b: string | number | null | undefined): string {
  const ac = toCents(a)
  const bc = toCents(b)
  if (Number.isNaN(ac) || Number.isNaN(bc)) return '0.00'
  return fromCents(ac - bc)
}

export function mulDec(a: string | number | null | undefined, b: string | number | null | undefined): string {
  const ac = toCents(a)
  const bc = toCents(b)
  if (Number.isNaN(ac) || Number.isNaN(bc)) return '0.00'
  // a * b in cents (a is already cents, so multiply by b's numeric value / 100)
  // To stay exact: (ac * bc) / 100 rounded.
  return fromCents(Math.round((ac * bc) / 100))
}

export function cmpDec(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const ac = toCents(a)
  const bc = toCents(b)
  if (Number.isNaN(ac) || Number.isNaN(bc)) return 0
  return ac < bc ? -1 : ac > bc ? 1 : 0
}

export function gteZero(a: string | number | null | undefined): boolean {
  const c = toCents(a)
  return !Number.isNaN(c) && c >= 0
}

// Convert a decimal string to integer cents (e.g. "12.34" -> 1234).
// Useful for any consumer that needs raw integer math.
export function toCentsInt(v: string | number | null | undefined): number {
  const c = toCents(v)
  return Number.isNaN(c) ? 0 : c
}

// Convert integer cents back to a decimal string.
export function fromCentsInt(cents: number): string {
  return fromCents(cents)
}

export function formatCurrency(amount: string | number | null | undefined, currency = 'USD', locale = 'en'): string {
  const cents = toCents(amount)
  const v = Number.isNaN(cents) ? 0 : cents / 100
  try {
    return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(v)
  } catch {
    return `$${v.toFixed(2)}`
  }
}

export function formatNumber(n: number, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US').format(n)
  } catch {
    return String(n)
  }
}

export function formatDate(d: Date | string, locale = 'en', opts?: Intl.DateTimeFormatOptions): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const loc = locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US'
  try {
    return new Intl.DateTimeFormat(loc, opts ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
  } catch {
    return date.toDateString()
  }
}

export function formatDateTime(d: Date | string, locale = 'en'): string {
  return formatDate(d, locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(d: Date | string, locale = 'en'): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = Date.now() - date.getTime()
  const loc = locale === 'fa' ? 'fa-IR' : locale === 'ar' ? 'ar' : locale === 'tr' ? 'tr-TR' : 'en-US'
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' })
  const mins = Math.round(diff / 60000)
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute')
  const hrs = Math.round(mins / 60)
  if (Math.abs(hrs) < 24) return rtf.format(-hrs, 'hour')
  const days = Math.round(hrs / 24)
  if (Math.abs(days) < 30) return rtf.format(-days, 'day')
  return rtf.format(-Math.round(days / 30), 'month')
}