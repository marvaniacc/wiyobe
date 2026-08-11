'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@/lib/i18n'

export type AppView =
  | { name: 'landing' }
  | { name: 'auth'; mode: 'signin' | 'signup'; role: string; roleLocked?: boolean }
  | { name: 'dashboard'; section: string }
  | { name: 'public-profile'; providerId: string; providerType: string }

export type SessionInfo = {
  id: string
  email: string
  role: string
  name: string | null
  preferredLanguage: string
  avatarUrl?: string | null
  kycStatus?: string
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
  goAuth: (mode: 'signin' | 'signup', role: string, roleLocked?: boolean) => void
  goDashboard: (section?: string) => void
  goPublicProfile: (providerId: string, providerType: string) => void

  // Dedicated chat page — bookingId of the conversation to auto-open on the
  // Messages section. Cleared after the conversation is selected.
  activeChatBookingId: string | null
  goMessages: (bookingId?: string) => void
  setActiveChatBookingId: (id: string | null) => void

  locale: Locale
  setLocale: (l: Locale) => void

  theme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (t: 'light' | 'dark') => void

  compareIds: string[]
  toggleCompare: (id: string) => void
  clearCompare: () => void

  // Persisted last dashboard section for refresh persistence
  lastSection: string | null
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
      goAuth: (mode, role, roleLocked = false) => set({ view: { name: 'auth', mode, role, roleLocked } }),
      goDashboard: (section = 'overview') => set({ view: { name: 'dashboard', section }, lastSection: section }),
      goPublicProfile: (providerId, providerType) => set({ view: { name: 'public-profile', providerId, providerType } }),

      activeChatBookingId: null,
      setActiveChatBookingId: (id) => set({ activeChatBookingId: id }),
      goMessages: (bookingId) => set({ view: { name: 'dashboard', section: 'messages' }, activeChatBookingId: bookingId ?? null }),

      locale: 'en',
      setLocale: (l) => set({ locale: l }),

      theme: 'light',
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
      setTheme: (t) => set({ theme: t }),

      compareIds: [],
      lastSection: null,
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
      partialize: (s) => ({ locale: s.locale, theme: s.theme, compareIds: s.compareIds, lastSection: s.lastSection }),
    }
  )
)
