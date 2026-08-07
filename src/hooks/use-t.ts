'use client'
import { useApp } from '@/stores/app-store'
import { translate, isRTL, type Locale } from '@/lib/i18n'

export function useT() {
  const locale = useApp((s) => s.locale)
  const t = (key: string, fallback?: string) => {
    // Brand is product-level configuration, not translated content.
    if (key === 'brand.name') return 'wiube'
    if (key === 'brand.tagline') return 'wish u best'
    return translate(locale as Locale, key, fallback)
  }
  return { t, locale: locale as Locale, dir: isRTL(locale as Locale) ? 'rtl' : 'ltr' as 'rtl' | 'ltr' }
}
