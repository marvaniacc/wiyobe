'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/lib/i18n'

export type AppView =
  | { name: 'landing' }
  | { name: 'auth'; mode: 'signin' | 'signup'; role: string }
  | { name: 'dashboard'; section: string }
  | { name: 'public-profile'; providerId: string; providerType: string }

export type SessionInfo = {
  id: string
  email: string
  role: string
  name: string | null
  preferredLanguage: string
} | null

interface AppState {
  session: SessionInfo
  sessionLoading: boolean
  setSession: (s: SessionInfo) => void
  setSessionLoading: (b: boolean) => void
  signOut: () => void

  view: AppView
  setView: (v: AppView) => void
  goLanding: () => void
  goAuth: (mode: 'signin' | 'signup', role: string) => void
  goDashboard: (section?: string) => void
  goPublicProfile: (providerId: string, providerType: string) => void

  locale: Locale
  setLocale: (l: Locale) => void

  theme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (t: 'light' | 'dark') => void

  compareIds: string[]
  toggleCompare: (id: string) => void
  clearCompare: () => void
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      session: null,
      sessionLoading: true,
      setSession: (s) => set({ session: s }),
      setSessionLoading: (b) => set({ sessionLoading: b }),
      signOut: () => set({ session: null, view: { name: 'landing' } }),

      view: { name: 'landing' },
      setView: (v) => set({ view: v }),
      goLanding: () => set({ view: { name: 'landing' } }),
      goAuth: (mode, role) => set({ view: { name: 'auth', mode, role } }),
      goDashboard: (section = 'overview') => set({ view: { name: 'dashboard', section } }),
      goPublicProfile: (providerId, providerType) => set({ view: { name: 'public-profile', providerId, providerType } }),

      locale: 'en',
      setLocale: (l) => set({ locale: l }),

      theme: 'light',
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      setTheme: (t) => set({ theme: t }),

      compareIds: [],
      toggleCompare: (id) =>
        set((s) => ({
          compareIds: s.compareIds.includes(id)
            ? s.compareIds.filter((x) => x !== id)
            : s.compareIds.length >= 4
              ? s.compareIds
              : [...s.compareIds, id],
        })),
      clearCompare: () => set({ compareIds: [] }),
    }),
    {
      name: 'medtravel-app',
      partialize: (s) => ({ locale: s.locale, theme: s.theme, compareIds: s.compareIds }),
    }
  )
)
