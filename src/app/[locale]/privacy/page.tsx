import type { Metadata } from 'next'
import { buildBreadcrumbJsonLd, buildStaticAlternates } from '@/lib/seo'

export const dynamic = 'force-dynamic'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const
const STATIC_PATH = '/privacy'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Wishubest Privacy Policy — how we collect, use, store, and protect your personal data on the medical tourism marketplace.',
  alternates: buildStaticAlternates('en', 'privacy'),
  openGraph: {
    title: 'Privacy Policy — Wishubest',
    description: 'How we collect, use, store, and protect your personal data on the medical tourism marketplace.',
    type: 'website',
    images: [{ url: '/og/wishubest-default.png', width: 1344, height: 768, alt: 'Wishubest Privacy Policy' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy — Wishubest',
    description: 'How we collect, use, store, and protect your personal data on the medical tourism marketplace.',
    images: ['/og/wishubest-default.png'],
  },
}

const LAST_UPDATED = 'August 2026'

/**
 * /{locale}/privacy — static Privacy Policy page.
 *
 * Standard privacy policy for a medical tourism marketplace. Pure SSR
 * static content — no DB queries. Renders inside the [locale] layout.
 *
 * NOTE: This is template legal text, not legal advice. Have a qualified
 * privacy attorney review and localize for each operating jurisdiction
 * (GDPR / CCPA / KVKK / etc.) before production launch.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildBreadcrumbJsonLd(locale, 'privacy') }}
      />

      <header className="border-b border-divider pb-6">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="prose prose-lg mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary">
        <section>
          <h2>1. Overview</h2>
          <p>
            Wishubest (&quot;we&quot;, &quot;us&quot;) respects your privacy. This
            Policy explains what data we collect, why we collect it, how long we
            keep it, and the rights you have over it. We comply with applicable
            data-protection laws including the EU GDPR and any local laws of the
            jurisdictions in which we operate.
          </p>
        </section>

        <section>
          <h2>2. Data we collect</h2>
          <h3>2.1 Data you provide</h3>
          <ul>
            <li>Account data: name, email, phone, country, city, preferred language.</li>
            <li>Profile data: role (patient/doctor/hospital/hotel/translator/affiliate), specialty, professional license number.</li>
            <li>KYC documents: government ID, professional licenses, liveness videos — stored locally on our server, never as Base64 in the database.</li>
            <li>Booking data: appointment requests, provider communications, payment metadata (we do not store full card numbers — payments are processed by a PCI-compliant processor).</li>
            <li>Medical records you choose to upload and share with providers.</li>
          </ul>
          <h3>2.2 Data collected automatically</h3>
          <ul>
            <li>Usage logs: IP address, browser type, pages visited, timestamps.</li>
            <li>Cookies: session cookie, locale preference, affiliate referral cookie (30-day expiry).</li>
          </ul>
        </section>

        <section>
          <h2>3. How we use your data</h2>
          <ul>
            <li>To provide, operate, and improve the Platform and its features.</li>
            <li>To verify provider identity and credentials (KYC) before listing.</li>
            <li>To process bookings, payments, refunds, and affiliate commissions.</li>
            <li>To send service notifications, security alerts, and (with consent) marketing communications.</li>
            <li>To comply with legal obligations and prevent fraud or abuse.</li>
          </ul>
        </section>

        <section>
          <h2>4. Legal basis (GDPR)</h2>
          <p>We process personal data on the following legal bases:</p>
          <ul>
            <li><strong>Consent</strong> — for marketing communications and non-essential cookies.</li>
            <li><strong>Contract</strong> — to fulfill bookings and provider agreements.</li>
            <li><strong>Legal obligation</strong> — KYC and tax record retention.</li>
            <li><strong>Legitimate interest</strong> — security logging, fraud prevention.</li>
          </ul>
        </section>

        <section>
          <h2>5. Data retention</h2>
          <p>
            We retain personal data only as long as necessary for the purposes set
            out above or as required by law. KYC documents are retained for the
            duration of the provider relationship plus the statutory retention
            period (typically 5–7 years for anti-money-laundering compliance).
            Booking records are retained for 7 years for tax and dispute purposes.
            You may request deletion of non-mandatory data at any time.
          </p>
        </section>

        <section>
          <h2>6. Sharing of data</h2>
          <p>
            We do not sell your personal data. We share data only with:
          </p>
          <ul>
            <li>Providers you book with — your name, contact details, and relevant medical records you consented to share.</li>
            <li>Payment processors — strictly the data needed to complete a transaction.</li>
            <li>Authorities — when legally required or to prevent fraud/abuse.</li>
            <li>Service providers — hosting, email, analytics — under data-processing agreements.</li>
          </ul>
        </section>

        <section>
          <h2>7. File storage</h2>
          <p>
            Uploaded files (KYC documents, medical records, media library assets)
            are saved to the local filesystem on our server under{' '}
            <code className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs">public/uploads/&lt;category&gt;/</code>{' '}
            and referenced by relative URL in the database. Files are never embedded
            as Base64 in database columns. Access to upload directories is
            restricted by the operating-system user account running the
            application.
          </p>
        </section>

        <section>
          <h2>8. Cookies</h2>
          <p>
            We use essential cookies (session, locale) and a 30-day affiliate
            referral cookie. Non-essential cookies require your consent, which you
            can manage via your browser settings. We do not use third-party
            advertising cookies.
          </p>
        </section>

        <section>
          <h2>9. Your rights</h2>
          <p>Subject to applicable law, you have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you.</li>
            <li>Rectify inaccurate data.</li>
            <li>Erasure (&quot;right to be forgotten&quot;) of non-mandatory data.</li>
            <li>Restrict or object to processing.</li>
            <li>Data portability — receive your data in a machine-readable format.</li>
            <li>Withdraw consent at any time (without affecting processing already carried out).</li>
          </ul>
          <p>
            To exercise these rights, contact us at{' '}
            <a href="mailto:privacy@wishubest.com">privacy@wishubest.com</a> or via
            our <a href={`/${locale}/contact`}>contact page</a>.
          </p>
        </section>

        <section>
          <h2>10. Security</h2>
          <p>
            We use industry-standard measures to protect your data: TLS for
            transit, scrypt for password hashing, HMAC-signed session cookies,
            role-based access control, and local filesystem isolation for uploaded
            files. No method of transmission or storage is 100% secure; we cannot
            guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>11. International transfers</h2>
          <p>
            Your data may be processed in countries other than your own. By using
            the Platform, you consent to such transfers subject to appropriate
            safeguards (Standard Contractual Clauses or equivalent).
          </p>
        </section>

        <section>
          <h2>12. Changes to this policy</h2>
          <p>
            We may update this Policy from time to time. Material changes will be
            announced via the Platform or by email. Continued use after the
            effective date constitutes acceptance.
          </p>
        </section>
      </div>
    </div>
  )
}
