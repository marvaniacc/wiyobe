import Link from 'next/link'
import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { ContactForm } from '@/components/shared/contact-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Wishubest team — partnerships, press, bug reports, and general inquiries.',
  alternates: { canonical: '/{locale}/contact' },
}

const CONTACT_CHANNELS = [
  {
    icon: 'mail',
    label: 'Email',
    value: 'hello@wishubest.com',
    href: 'mailto:hello@wishubest.com',
  },
  {
    icon: 'support_agent',
    label: 'Support',
    value: '24-hour response on weekdays',
  },
  {
    icon: 'schedule',
    label: 'Hours',
    value: 'Mon–Fri, 9:00–18:00 (GMT+3)',
  },
]

/**
 * /{locale}/contact — public Contact page.
 *
 * Shows contact channels + an authenticated contact form. Logged-in users
 * can submit a ticket (POSTs to /api/tickets with category='other');
 * guests see a sign-in CTA. The topic select is prefixed to the ticket
 * subject so admins can triage by topic.
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await getSession()

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
          <span className="material-symbols-outlined" style={{ fontSize: 36 }} aria-hidden>
            contact_support
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Contact us
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Questions, partnerships, press, or bug reports — we&apos;d love to hear from you.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Channels sidebar */}
        <aside className="space-y-4">
          {CONTACT_CHANNELS.map((ch) => (
            <div
              key={ch.label}
              className="flex items-start gap-3 rounded-[16px] border border-divider bg-surface p-4"
            >
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontSize: 24 }}
                aria-hidden
              >
                {ch.icon}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ch.label}
                </p>
                {ch.href ? (
                  <a
                    href={ch.href}
                    className="block truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                  >
                    {ch.value}
                  </a>
                ) : (
                  <p className="text-sm font-semibold text-foreground">{ch.value}</p>
                )}
              </div>
            </div>
          ))}
        </aside>

        {/* Form or CTA */}
        <div className="lg:col-span-2">
          {session ? (
            <ContactForm />
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-[24px] border border-dashed border-divider bg-surface p-8 text-center sm:p-12">
              <div className="flex size-14 items-center justify-center rounded-[16px] bg-primary/10 text-primary">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 28 }}
                  aria-hidden
                >
                  lock
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Sign in to submit a ticket
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  To track your inquiry and receive a response, please sign in or
                  create an account. Your message becomes a support ticket visible
                  in your dashboard.
                </p>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                <Link
                  href="/dashboard?auth=signin"
                  className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Sign in
                </Link>
                <Link
                  href="/dashboard?auth=signup&role=patient"
                  className="rounded-full border border-divider px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  Create account
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
