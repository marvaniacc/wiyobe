import type { Metadata } from 'next'
import { buildBreadcrumbJsonLd, buildStaticAlternates } from '@/lib/seo'

export const dynamic = 'force-dynamic'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const
const STATIC_PATH = '/terms'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Wishubest Terms of Service — the agreement between you and Wishubest governing your use of the medical tourism marketplace.',
  alternates: buildStaticAlternates('en', 'terms'),
  openGraph: {
    title: 'Terms of Service — Wishubest',
    description: 'The agreement between you and Wishubest governing your use of the medical tourism marketplace.',
    type: 'website',
    images: [{ url: '/og/wishubest-default.png', width: 1344, height: 768, alt: 'Wishubest Terms of Service' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service — Wishubest',
    description: 'The agreement between you and Wishubest governing your use of the medical tourism marketplace.',
    images: ['/og/wishubest-default.png'],
  },
}

const LAST_UPDATED = 'August 2026'

/**
 * /{locale}/terms — static Terms of Service page.
 *
 * Standard legal terms for a medical tourism marketplace. Pure SSR static
 * content — no DB queries. Renders inside the [locale] layout (PublicHeader
 * + main + PublicFooter with sticky footer).
 *
 * NOTE: This is template legal text, not legal advice. Have a qualified
 * attorney review and localize for each operating jurisdiction before
 * production launch.
 */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildBreadcrumbJsonLd(locale, 'terms') }}
      />

      <header className="border-b border-divider pb-6">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="prose prose-lg mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary">
        <section>
          <h2>1. Acceptance of terms</h2>
          <p>
            By accessing or using Wishubest (the &quot;Platform&quot;), you agree to be
            bound by these Terms of Service and our Privacy Policy. If you do not
            agree, you may not access or use the Platform.
          </p>
        </section>

        <section>
          <h2>2. Description of service</h2>
          <p>
            Wishubest is an online marketplace that connects patients with verified
            doctors, hospitals, accommodations, and translators for medical
            tourism. We facilitate discovery, communication, and booking but are not
            a healthcare provider, insurer, or travel agent. We do not provide
            medical advice, diagnosis, or treatment.
          </p>
        </section>

        <section>
          <h2>3. Eligibility &amp; accounts</h2>
          <p>
            You must be at least 18 years old and legally capable of entering into
            contracts to use the Platform. You agree to provide accurate, current,
            and complete information during registration and to keep your account
            information updated. You are responsible for maintaining the
            confidentiality of your credentials and for all activity under your
            account.
          </p>
        </section>

        <section>
          <h2>4. Provider verification (KYC)</h2>
          <p>
            Providers (doctors, hospitals, hotels, translators) must complete our
            KYC verification process before being listed as &quot;verified&quot;.
            Verification includes identity documents and, where required, professional
            licenses. Wishubest reserves the right to suspend or remove any provider
            whose credentials cannot be confirmed or who breaches these Terms.
          </p>
        </section>

        <section>
          <h2>5. Bookings &amp; payments</h2>
          <p>
            Bookings made through the Platform are subject to the cancellation
            policy displayed on each provider&apos;s listing. Platform payments are
            escrowed and released to the provider only after a booking is confirmed.
            Wishubest charges a platform commission on completed bookings, the rate
            of which is published per provider type in the dashboard. Taxes, where
            applicable, are the responsibility of the provider or patient as
            required by local law.
          </p>
        </section>

        <section>
          <h2>6. Affiliate program</h2>
          <p>
            Affiliates earn a flat percentage of the platform commission on
            referred bookings, tracked via a 30-day cookie. Affiliates are not
            employees or agents of Wishubest and may not represent themselves as
            such. Multi-level marketing, spam, or fraudulent referrals are
            prohibited and result in immediate termination and forfeiture of
            pending payouts.
          </p>
        </section>

        <section>
          <h2>7. Prohibited conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Violate any applicable law or regulation.</li>
            <li>Impersonate another person or misrepresent your credentials.</li>
            <li>Submit false, misleading, or fraudulent KYC documents.</li>
            <li>Interfere with the Platform&apos;s security, integrity, or availability.</li>
            <li>Use the Platform to transmit medical advice, content, or materials that are unlawful, defamatory, or infringe intellectual property rights.</li>
            <li>Circumvent the Platform to avoid fees or commissions.</li>
          </ul>
        </section>

        <section>
          <h2>8. Medical disclaimer</h2>
          <p>
            The Platform does not provide medical advice, diagnosis, or treatment.
            Always seek the advice of a qualified healthcare provider with any
            questions you may have regarding a medical condition. Never disregard
            professional medical advice or delay seeking it because of something
            you read on the Platform. Wishubest is not liable for the medical
            decisions or outcomes of any patient-provider relationship formed via
            the Platform.
          </p>
        </section>

        <section>
          <h2>9. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Wishubest, its directors,
            employees, and affiliates shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, including
            but not limited to loss of profits, data, or goodwill, arising out of
            or related to your use of the Platform.
          </p>
        </section>

        <section>
          <h2>10. Changes to these terms</h2>
          <p>
            We may modify these Terms from time to time. Material changes will be
            announced via the Platform or by email. Continued use after the
            effective date constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2>11. Governing law</h2>
          <p>
            These Terms are governed by the laws of the jurisdiction in which
            Wishubest is incorporated, without regard to conflict-of-law principles.
            Any disputes shall be submitted to the exclusive jurisdiction of the
            competent courts of that jurisdiction.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            Questions about these Terms can be sent to{' '}
            <a href="mailto:legal@wishubest.com">legal@wishubest.com</a> or via our{' '}
            <a href={`/${locale}/contact`}>contact page</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
