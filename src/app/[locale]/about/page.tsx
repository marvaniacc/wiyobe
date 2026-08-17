import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const
const STATIC_PATH = '/about'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Wishubest — the global medical tourism marketplace connecting patients with verified doctors, hospitals, accommodations, and translators worldwide.',
  alternates: {
    canonical: `/{locale}${STATIC_PATH}`,
    languages: Object.fromEntries([
      ...SUPPORTED_LOCALES.map((l) => [l, `/${l}${STATIC_PATH}`]),
      ['x-default', `/en${STATIC_PATH}`],
    ]),
  },
}

/**
 * /{locale}/about — static About page.
 *
 * Renders the brand mission, how-it-works steps, and CTAs. This route is
 * linked from the PublicFooter's "Resources" column. No DB queries — pure
 * server-rendered static content for SEO.
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
          <span className="material-symbols-outlined" style={{ fontSize: 36 }} aria-hidden>
            monitor_heart
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          About Wishubest
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          The global medical tourism marketplace — connecting patients with verified
          doctors, hospitals, accommodations, and translators worldwide.
        </p>
      </div>

      {/* Mission */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold text-foreground">Our mission</h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Medical travel should be safe, transparent, and accessible. Wishubest
          brings every part of the journey — from finding the right specialist to
          booking a recovery hotel and a translator who speaks your language — into
          a single verified marketplace. We hold providers to a strict KYC standard,
          escrow platform payments, and surface real patient reviews so you can make
          an informed decision.
        </p>
      </section>

      {/* How it works */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold text-foreground">How it works</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            {
              icon: 'search',
              title: '1. Compare providers',
              desc: 'Browse verified doctors, hospitals, hotels, and translators. Filter by country, specialty, language, and price.',
            },
            {
              icon: 'verified_user',
              title: '2. Book securely',
              desc: 'Book with confidence — every provider has passed KYC. Platform payments are escrowed until your appointment is confirmed.',
            },
            {
              icon: 'flight_takeoff',
              title: '3. Travel & recover',
              desc: 'Coordinate your trip with translators and accommodation. Access your medical records and chat with your provider in-app.',
            },
          ].map((step) => (
            <div
              key={step.title}
              className="flex flex-col gap-3 rounded-[16px] border border-divider bg-surface p-5"
            >
              <div className="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden>
                  {step.icon}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust signals */}
      <section className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { icon: 'verified', label: 'KYC-verified providers', desc: 'Every doctor, hospital, hotel, and translator passes identity verification.' },
          { icon: 'lock', label: 'Escrowed payments', desc: 'Funds are released to the provider only after your booking is confirmed.' },
          { icon: 'translate', label: 'Multilingual support', desc: 'Book translators and chat in 5 languages — English, Turkish, Persian, Arabic, Russian.' },
        ].map((sig) => (
          <div key={sig.label} className="flex items-start gap-3 rounded-[12px] bg-surface-secondary p-4">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 24 }} aria-hidden>
              {sig.icon}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{sig.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{sig.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="mt-16 rounded-[24px] border border-divider bg-gradient-to-br from-primary/5 to-transparent p-8 text-center sm:p-12">
        <h2 className="text-2xl font-bold text-foreground">Ready to find your provider?</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Browse verified doctors, hospitals, hotels, and translators worldwide.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/${locale}/doctors`}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse Doctors
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-divider px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Sign up
          </Link>
        </div>
      </section>
    </div>
  )
}
