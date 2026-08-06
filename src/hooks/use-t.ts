'use client'
import { useApp } from '@/stores/app-store'
import { translate, isRTL, type Locale } from '@/lib/i18n'

export function useT() {
  const locale = useApp((s) => s.locale)
  const t = (key: string, fallback?: string) => translate(locale as Locale, key, fallback)
  return { t, locale: locale as Locale, dir: isRTL(locale as Locale) ? 'rtl' : 'ltr' as 'rtl' | 'ltr' }
}
