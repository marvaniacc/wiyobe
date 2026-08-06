// Decimal/money helpers — all amounts stored as strings in SQLite
export function toDec(n: number | string): string {
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (!isFinite(v)) return '0'
  return v.toFixed(2)
}

export function addDec(...vals: (string | number | null | undefined)[]): string {
  const sum = vals.reduce((acc, v) => acc + (v == null ? 0 : typeof v === 'string' ? parseFloat(v) || 0 : v), 0)
  return sum.toFixed(2)
}

export function subDec(a: string | number, b: string | number): string {
  const av = typeof a === 'string' ? parseFloat(a) || 0 : a
  const bv = typeof b === 'string' ? parseFloat(b) || 0 : b
  return (av - bv).toFixed(2)
}

export function mulDec(a: string | number, b: string | number): string {
  const av = typeof a === 'string' ? parseFloat(a) || 0 : a
  const bv = typeof b === 'string' ? parseFloat(b) || 0 : b
  return (av * bv).toFixed(2)
}

export function cmpDec(a: string | number, b: string | number): number {
  const av = typeof a === 'string' ? parseFloat(a) || 0 : a
  const bv = typeof b === 'string' ? parseFloat(b) || 0 : b
  return av < bv ? -1 : av > bv ? 1 : 0
}

export function gteZero(a: string | number): boolean {
  const av = typeof a === 'string' ? parseFloat(a) || 0 : a
  return av >= 0
}

export function formatCurrency(amount: string | number, currency = 'USD', locale = 'en'): string {
  const v = typeof amount === 'string' ? parseFloat(amount) || 0 : amount
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
