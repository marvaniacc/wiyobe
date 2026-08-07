'use client'

import { useState } from 'react'
import { useApp } from '@/stores/app-store'
import { Icon } from '@/components/shared/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const CATEGORIES = [
  { label: 'Doctors', icon: 'medical_services' },
  { label: 'Dentists', icon: 'dentistry' },
  { label: 'Therapists', icon: 'psychology' },
  { label: 'Lawyers', icon: 'gavel' },
  { label: 'Consultants', icon: 'business_center' },
  { label: 'Coaches', icon: 'school' },
]

const TRUST_ITEMS = [
  { icon: 'verified_user', title: 'Verified professionals', text: 'Profiles, credentials and services can be reviewed before booking.' },
  { icon: 'schedule', title: 'Book in minutes', text: 'Choose a service, pick a time and get a clear confirmation.' },
  { icon: 'language', title: 'Global by design', text: 'Discover experts by specialty, location, language and online availability.' },
]

export function LandingPage() {
  const goAuth = useApp((s) => s.goAuth)
  const locale = useApp((s) => s.locale)
  const setLocale = useApp((s) => s.setLocale)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const { dir } = useT()
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')

  const startSearch = () => goAuth('signup', 'PATIENT')

  return (
    <div className="min-h-screen bg-background text-foreground" dir={dir}>
      <header className="sticky top-0 z-30 border-b border-divider/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
          <button className="flex items-center gap-2.5" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Wiube home">
            <div className="flex size-9 items-center justify-center rounded-[12px] bg-foreground text-background"><span className="text-lg font-bold tracking-tight">w</span></div>
            <span className="text-[18px] font-semibold tracking-[-0.02em]">wiube</span>
          </button>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#categories" className="transition-colors hover:text-foreground">Explore</a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
            <button onClick={() => goAuth('signup', 'DOCTOR')} className="transition-colors hover:text-foreground">For professionals</button>
          </nav>
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Change language"><Icon name="language" size={19} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {LOCALES.map((l) => <DropdownMenuItem key={l} onClick={() => setLocale(l as Locale)} className={cn(locale === l && 'bg-accent')}><span className="text-base">{LOCALE_META[l].flag}</span>{LOCALE_META[l].native}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon" variant="ghost" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size={19} /></Button>
            <Button variant="ghost" onClick={() => goAuth('signin', 'PATIENT')} className="hidden sm:inline-flex">Sign in</Button>
            <Button onClick={() => goAuth('signup', 'PATIENT')}>Get started</Button>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-divider">
          <div className="mx-auto max-w-7xl px-4 pb-20 pt-20 md:px-8 md:pb-28 md:pt-28">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-divider bg-surface px-3.5 py-1.5 text-xs font-medium text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />Find trusted experts. Book with confidence.</div>
              <h1 className="text-balance text-5xl font-semibold tracking-[-0.045em] md:text-7xl md:leading-[1.02]">The right expert.<br className="hidden sm:block" /> The right time.</h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground md:text-lg">Discover professionals around the world, compare what matters and book online or in person — all in one place.</p>

              <div className="mx-auto mt-10 max-w-3xl rounded-[22px] border border-divider bg-surface p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
                <div className="flex flex-col gap-2 md:flex-row">
                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-4 py-3 text-start hover:bg-accent/50">
                    <Icon name="search" size={21} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1"><label htmlFor="expert-search" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What do you need?</label><Input id="expert-search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startSearch()} placeholder="Specialty, service or expert" className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" /></div>
                  </div>
                  <div className="hidden w-px bg-divider md:block" />
                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] px-4 py-3 text-start hover:bg-accent/50">
                    <Icon name="location_on" size={21} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1"><label htmlFor="expert-location" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Where?</label><Input id="expert-location" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startSearch()} placeholder="City or anywhere online" className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" /></div>
                  </div>
                  <Button size="lg" onClick={startSearch} className="h-12 rounded-[16px] px-6 md:self-stretch">Search <Icon name="arrow_forward" size={18} className="rtl:rotate-180" /></Button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground"><span>Popular:</span>{['Doctors', 'Dentists', 'Therapists', 'Lawyers', 'Consultants'].map((item) => <button key={item} onClick={() => { setQuery(item); startSearch() }} className="rounded-full border border-divider bg-surface px-3 py-1.5 transition hover:border-foreground/20 hover:text-foreground">{item}</button>)}</div>
            </div>
          </div>
        </section>

        <section id="categories" className="border-b border-divider bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-20">
            <div className="flex items-end justify-between gap-6"><div><p className="text-sm font-medium text-muted-foreground">Explore</p><h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Find an expert for almost anything.</h2></div><span className="hidden text-sm text-muted-foreground md:block">More categories coming soon</span></div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{CATEGORIES.map((category) => <button key={category.label} onClick={() => { setQuery(category.label); startSearch() }} className="group rounded-[18px] border border-divider bg-background p-5 text-start transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm"><div className="flex size-10 items-center justify-center rounded-[12px] bg-accent text-foreground transition group-hover:bg-foreground group-hover:text-background"><Icon name={category.icon} size={21} fill /></div><div className="mt-5 text-sm font-semibold">{category.label}</div><div className="mt-1 text-xs text-muted-foreground">Explore experts</div></button>)}</div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-divider">
          <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-20"><div className="max-w-2xl"><p className="text-sm font-medium text-muted-foreground">Simple by design</p><h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">From search to consultation without the friction.</h2></div><div className="mt-12 grid gap-8 md:grid-cols-3">{[['01', 'Discover', 'Search by specialty, location, language, price or online availability.'], ['02', 'Choose a time', 'Review the expert, select a service and pick a convenient available slot.'], ['03', 'Meet', 'Get your confirmation and meeting details, then connect at the scheduled time.']].map(([number, title, text]) => <div key={number} className="border-t border-divider pt-5"><span className="text-xs font-semibold tracking-widest text-muted-foreground">{number}</span><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{text}</p></div>)}</div></div>
        </section>

        <section className="border-b border-divider bg-surface"><div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-20"><div className="grid gap-8 md:grid-cols-3">{TRUST_ITEMS.map((item) => <div key={item.title} className="flex gap-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent"><Icon name={item.icon} size={20} /></div><div><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.text}</p></div></div>)}</div></div></section>

        <section><div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24"><div className="rounded-[24px] border border-divider bg-accent/50 px-6 py-12 text-center md:px-12"><h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Your expertise deserves a global audience.</h2><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Create a professional profile, offer your services and let people book time with you.</p><Button size="lg" className="mt-7 rounded-full px-7" onClick={() => goAuth('signup', 'DOCTOR')}>Join as a professional <Icon name="arrow_forward" size={18} className="rtl:rotate-180" /></Button></div></div></section>
      </main>

      <footer className="border-t border-divider bg-surface"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8"><div className="flex items-center gap-2"><div className="flex size-7 items-center justify-center rounded-[9px] bg-foreground text-background"><span className="text-sm font-bold">w</span></div><span className="font-semibold text-foreground">wiube</span><span>· wish u best</span></div><div className="flex gap-5"><span>Privacy</span><span>Terms</span><span>Support</span></div><span>© {new Date().getFullYear()} wiube.com</span></div></footer>
    </div>
  )
}
