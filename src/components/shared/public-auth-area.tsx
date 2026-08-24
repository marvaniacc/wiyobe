'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { SessionUser } from '@/lib/auth'

type PublicAuthAreaProps = {
  /** Server-rendered initial state (from the SSR session). */
  initialIsAuth: boolean
  initialSession: { name: string | null; email: string; role: string; avatarUrl: string | null } | null
  ctaText?: string
  ctaHref: string
}

/**
 * PublicAuthArea — the auth section of the public header.
 *
 * The server renders its best guess, but this component RE-PROBES
 * /api/auth/session after mount and corrects the UI if reality differs.
 * This heals stale cached shells (e.g. a guest render of the page held in
 * browser/bfcache after three deploys rotated JS chunks) where the header
 * would otherwise show "Login / Sign Up" to an authenticated user.
 */
export function PublicAuthArea({ initialIsAuth, initialSession, ctaText, ctaHref }: PublicAuthAreaProps) {
  const [isAuth, setIsAuth] = useState(initialIsAuth)
  const [session, setSession] = useState(initialSession)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.session) {
          setIsAuth(true)
          setSession(data.session)
        } else {
          setIsAuth(false)
          setSession(null)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (isAuth && session) {
    return (
      /* Authenticated: avatar dropdown (CSS-only) */
      <div className="group relative">
        <button className="flex items-center gap-2 rounded-full border border-divider p-1 pe-3 transition-colors hover:border-primary">
          <Avatar className="size-7">
            <AvatarImage src={session.avatarUrl || undefined} alt={session.name || 'User'} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {session.name?.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[100px] truncate text-sm font-medium text-foreground sm:inline">
            {session.name || session.email}
          </span>
          <span className="material-symbols-outlined text-muted-foreground" style={{ fontSize: 16 }} aria-hidden>
            expand_more
          </span>
        </button>
        <div className="invisible absolute end-0 top-full z-50 mt-1 w-48 rounded-[14px] border border-divider bg-surface p-1 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
          <div className="border-b border-divider px-3 py-2">
            <p className="truncate text-sm font-semibold text-foreground">{session.name || session.email}</p>
            <p className="text-xs text-muted-foreground">{session.role}</p>
          </div>
          <Link href="/dashboard" className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>dashboard</span>
            Dashboard
          </Link>
          <Link href="/dashboard?section=profile" className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>account_circle</span>
            Profile
          </Link>
          <a href="/api/auth/signout" className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>logout</span>
            Logout
          </a>
        </div>
      </div>
    )
  }

  return (
    /* Unauthenticated: CTA button (dynamic from headerConfig) */
    ctaText ? (
      <Link
        href={ctaHref}
        className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {ctaText}
      </Link>
    ) : null
  )
}

export type { SessionUser }
