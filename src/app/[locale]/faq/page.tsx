import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const
const STATIC_PATH = '/faq'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about Wishubest — booking, payments, KYC verification, affiliate program, and medical travel.',
  alternates: {
    canonical: `/{locale}${STATIC_PATH}`,
    languages: Object.fromEntries([
      ...SUPPORTED_LOCALES.map((l) => [l, `/${l}${STATIC_PATH}`]),
      ['x-default', `/en${STATIC_PATH}`],
    ]),
  },
}

type FAQItem = {
  q: string
  a: string
}

type FAQSection = {
  title: string
  icon: string
  items: FAQItem[]
}

const FAQ_SECTIONS: FAQSection[] = [
  {
    title: 'Booking & providers',
    icon: 'event',
    items: [
      {
        q: 'How do I book a doctor or hospital?',
        a: 'Browse the provider type you need (doctors, hospitals, hotels, translators), filter by country and specialty, then click "Book now" on the provider\'s profile. Enter your preferred date and time, confirm the booking, and your platform payment is escrowed until the provider confirms the appointment.',
      },
      {
        q: 'Are all providers verified?',
        a: 'Only providers who pass KYC verification (identity documents, professional licenses, and — where required — a liveness video) appear with a "verified" badge in public listings. Unverified providers are hidden from public search.',
      },
      {
        q: 'Can I message a provider before booking?',
        a: 'Yes. Once you have an account, you can open a conversation with any verified provider via the in-app Messages feature. Translations are available in 5 languages.',
      },
      {
        q: 'What if I need to cancel?',
        a: 'Each provider publishes their own cancellation policy on their profile. Refunds are processed automatically per the policy — typically full refund up to 48 hours before the appointment, partial refund up to 24 hours, and no refund within 24 hours.',
      },
    ],
  },
  {
    title: 'Payments',
    icon: 'payments',
    items: [
      {
        q: 'How does payment work?',
        a: 'When you book, the platform payment is charged and escrowed. The provider only receives the funds after the booking is confirmed. If the provider declines or the booking is cancelled per the cancellation policy, the funds are refunded automatically.',
      },
      {
        q: 'What is the platform commission?',
        a: 'Wishubest charges a flat commission per provider type (e.g. 15% for doctors, 10% for hospitals, 12% for hotels, 18% for translators). The commission is deducted from the provider\'s payout, not added to the patient\'s price.',
      },
      {
        q: 'Which currencies are supported?',
        a: 'All prices are listed in USD. Your card issuer converts the charge to your local currency at the prevailing rate. Some local payment methods may be available depending on your country.',
      },
    ],
  },
  {
    title: 'KYC & verification',
    icon: 'verified_user',
    items: [
      {
        q: 'Why do I need to upload KYC documents?',
        a: 'Providers must complete KYC to verify their identity and professional credentials before being listed. This protects patients from fraudulent providers and is required by anti-money-laundering regulations.',
      },
      {
        q: 'What documents do I need to upload?',
        a: 'It depends on your provider type. Doctors upload a medical license and ID; hospitals upload an operating license and tax certificate; hotels upload a business license and tourism certificate; translators upload a translation certification and criminal-record check. All provider types also record a 5-second liveness video via webcam.',
      },
      {
        q: 'How long does verification take?',
        a: 'Typically 24–48 hours. You will receive an in-app notification when your documents are approved or if a rejection reason is provided. You can re-upload rejected documents immediately.',
      },
      {
        q: 'Where are my documents stored?',
        a: 'Documents are saved to the local filesystem on our server under /uploads/kyc/ and referenced by a relative URL. We never store documents as Base64 in the database. Access is restricted by the operating-system user account running the application.',
      },
    ],
  },
  {
    title: 'Affiliate program',
    icon: 'campaign',
    items: [
      {
        q: 'How does the affiliate program work?',
        a: 'Affiliates earn a flat percentage of the platform\'s commission on referred bookings — e.g. if the platform earns 30% commission on a booking, an affiliate with a 25% rate earns 25% of that 30%. There is no multi-level marketing: you only earn on your direct referrals.',
      },
      {
        q: 'How is a referral tracked?',
        a: 'A 30-day cookie is set when a visitor clicks your affiliate link. If they sign up and book within 30 days, the commission is attributed to you. The referral relationship is also stored server-side, so it persists even if the visitor clears their cookies.',
      },
      {
        q: 'When do I get paid?',
        a: 'Affiliate commissions are released to your available balance when the referred booking is completed. Payouts are processed on the schedule set in your dashboard (default: 7 days after the booking completion date).',
      },
    ],
  },
  {
    title: 'Medical & legal',
    icon: 'medical_information',
    items: [
      {
        q: 'Does Wishubest provide medical advice?',
        a: 'No. Wishubest is a marketplace that connects patients with providers. We do not provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider with any medical questions.',
      },
      {
        q: 'Is my medical data secure?',
        a: 'Medical records you choose to upload are stored on our server and accessible only to providers you explicitly authorise. Transit is encrypted via TLS. Access is logged and auditable. See our Privacy Policy for full details.',
      },
      {
        q: 'Can I get a translator for my appointment?',
        a: 'Yes. Translators are listed as a provider type and can be booked alongside your medical appointment. Translators cover 5 languages: English, Turkish, Persian, Arabic, and Russian.',
      },
    ],
  },
]

/**
 * /{locale}/faq — static FAQ page with expandable sections.
 *
 * Pure SSR static content — no DB queries. Grouped into 5 sections
 * (Booking, Payments, KYC, Affiliate, Medical & legal) with material icons.
 * Each item is an accordion-style <details> element for native accessibility
 * (no client JS required).
 */
export default async function FAQPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
          <span className="material-symbols-outlined" style={{ fontSize: 36 }} aria-hidden>
            help
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Frequently Asked Questions
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Everything you need to know about booking, payments, verification, and more.
        </p>
      </div>

      {/* Sections */}
      <div className="mt-12 space-y-10">
        {FAQ_SECTIONS.map((section) => (
          <section key={section.title}>
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontSize: 22 }}
                aria-hidden
              >
                {section.icon}
              </span>
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
            </div>
            <div className="mt-4 space-y-2">
              {section.items.map((item, idx) => (
                <details
                  key={idx}
                  className="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">
                    <span>{item.q}</span>
                    <span
                      className="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      style={{ fontSize: 20 }}
                      aria-hidden
                    >
                      expand_more
                    </span>
                  </summary>
                  <div className="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Contact CTA */}
      <div className="mt-16 rounded-[24px] border border-divider bg-gradient-to-br from-primary/5 to-transparent p-8 text-center sm:p-12">
        <h2 className="text-2xl font-bold text-foreground">Still have questions?</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Our support team is here to help. Reach out and we&apos;ll respond within 24 hours.
        </p>
        <Link
          href={`/${locale}/contact`}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
            contact_support
          </span>
          Contact us
        </Link>
      </div>
    </div>
  )
}
