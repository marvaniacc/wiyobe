/**
 * Seed static Custom Pages (about, faq, terms, privacy) as locale-specific
 * Custom Pages. Admin can then create translations for other locales (fa,
 * ar, tr, ru) by creating pages with the same slug but different language.
 *
 * Usage: bun run scripts/seed-static-pages.ts
 *
 * Idempotent — uses upsert with compound unique [slug, language].
 */
import { db } from '../src/lib/db'

// Helper: wrap content in a max-width container
function wrap(title: string, innerHtml: string): string {
  return `<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
  <header class="border-b border-divider pb-6">
    <h1 class="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">${title}</h1>
  </header>
  <div class="prose prose-lg mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-[12px] prose-blockquote:border-s-primary prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:ps-4 prose-li:my-1">
    ${innerHtml}
  </div>
</div>`
}

const ABOUT_HTML = wrap('About Wishubest', `
  <div class="text-center mt-8">
    <div class="mx-auto mb-6 flex size-16 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
      <span class="material-symbols-outlined" style="font-size: 36px" aria-hidden>monitor_heart</span>
    </div>
    <p class="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">The global medical tourism marketplace — connecting patients with verified doctors, hospitals, accommodations, and translators worldwide.</p>
  </div>

  <section class="mt-16">
    <h2 class="text-2xl font-semibold text-foreground">Our mission</h2>
    <p class="mt-4 text-base leading-relaxed text-muted-foreground">Medical travel should be safe, transparent, and accessible. Wishubest brings every part of the journey — from finding the right specialist to booking a recovery hotel and a translator who speaks your language — into a single verified marketplace. We hold providers to a strict KYC standard, escrow platform payments, and surface real patient reviews so you can make an informed decision.</p>
  </section>

  <section class="mt-16">
    <h2 class="text-2xl font-semibold text-foreground">How it works</h2>
    <div class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
      <div class="flex flex-col gap-3 rounded-[16px] border border-divider bg-surface p-5">
        <div class="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><span class="material-symbols-outlined" style="font-size: 22px" aria-hidden>search</span></div>
        <h3 class="text-sm font-semibold text-foreground">1. Compare providers</h3>
        <p class="text-sm text-muted-foreground">Browse verified doctors, hospitals, hotels, and translators. Filter by country, specialty, language, and price.</p>
      </div>
      <div class="flex flex-col gap-3 rounded-[16px] border border-divider bg-surface p-5">
        <div class="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><span class="material-symbols-outlined" style="font-size: 22px" aria-hidden>verified_user</span></div>
        <h3 class="text-sm font-semibold text-foreground">2. Book securely</h3>
        <p class="text-sm text-muted-foreground">Book with confidence — every provider has passed KYC. Platform payments are escrowed until your appointment is confirmed.</p>
      </div>
      <div class="flex flex-col gap-3 rounded-[16px] border border-divider bg-surface p-5">
        <div class="flex size-10 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><span class="material-symbols-outlined" style="font-size: 22px" aria-hidden>flight_takeoff</span></div>
        <h3 class="text-sm font-semibold text-foreground">3. Travel &amp; recover</h3>
        <p class="text-sm text-muted-foreground">Coordinate your trip with translators and accommodation. Access your medical records and chat with your provider in-app.</p>
      </div>
    </div>
  </section>

  <section class="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
    <div class="flex items-start gap-3 rounded-[12px] bg-surface-secondary p-4"><span class="material-symbols-outlined text-primary" style="font-size: 24px" aria-hidden>verified</span><div><p class="text-sm font-semibold text-foreground">KYC-verified providers</p><p class="mt-0.5 text-xs text-muted-foreground">Every doctor, hospital, hotel, and translator passes identity verification.</p></div></div>
    <div class="flex items-start gap-3 rounded-[12px] bg-surface-secondary p-4"><span class="material-symbols-outlined text-primary" style="font-size: 24px" aria-hidden>lock</span><div><p class="text-sm font-semibold text-foreground">Escrowed payments</p><p class="mt-0.5 text-xs text-muted-foreground">Funds are released to the provider only after your booking is confirmed.</p></div></div>
    <div class="flex items-start gap-3 rounded-[12px] bg-surface-secondary p-4"><span class="material-symbols-outlined text-primary" style="font-size: 24px" aria-hidden>translate</span><div><p class="text-sm font-semibold text-foreground">Multilingual support</p><p class="mt-0.5 text-xs text-muted-foreground">Book translators and chat in 5 languages — English, Turkish, Persian, Arabic, Russian.</p></div></div>
  </section>

  <section class="mt-16 rounded-[24px] border border-divider bg-gradient-to-br from-primary/5 to-transparent p-8 text-center sm:p-12">
    <h2 class="text-2xl font-bold text-foreground">Ready to find your provider?</h2>
    <p class="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">Browse verified doctors, hospitals, hotels, and translators worldwide.</p>
    <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
      <a href="/en/doctors" class="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">Browse Doctors</a>
      <a href="/en/signup" class="rounded-full border border-divider px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">Sign up</a>
    </div>
  </section>
`)

const FAQ_HTML = wrap('Frequently Asked Questions', `
  <p class="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground text-center">Everything you need to know about booking, payments, verification, and more.</p>

  <div class="mt-12 space-y-10">
    <section>
      <h2 class="text-xl font-semibold text-foreground">Booking &amp; providers</h2>
      <div class="mt-4 space-y-2">
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">How do I book a doctor or hospital?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">Browse the provider type you need (doctors, hospitals, hotels, translators), filter by country and specialty, then click "Book now" on the provider's profile. Enter your preferred date and time, confirm the booking, and your platform payment is escrowed until the provider confirms the appointment.</div>
        </details>
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">Are all providers verified?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">Only providers who pass KYC verification (identity documents, professional licenses, and — where required — a liveness video) appear with a "verified" badge in public listings. Unverified providers are hidden from public search.</div>
        </details>
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">Can I message a provider before booking?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">Yes. Once you have an account, you can open a conversation with any verified provider via the in-app Messages feature. Translations are available in 5 languages.</div>
        </details>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-semibold text-foreground">Payments</h2>
      <div class="mt-4 space-y-2">
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">How does payment work?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">When you book, the platform payment is charged and escrowed. The provider only receives the funds after the booking is confirmed. If the provider declines or the booking is cancelled per the cancellation policy, the funds are refunded automatically.</div>
        </details>
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">What is the platform commission?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">Wishubest charges a flat commission per provider type (e.g. 15% for doctors, 10% for hospitals, 12% for hotels, 18% for translators). The commission is deducted from the provider's payout, not added to the patient's price.</div>
        </details>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-semibold text-foreground">KYC &amp; verification</h2>
      <div class="mt-4 space-y-2">
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">Why do I need to upload KYC documents?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">Providers must complete KYC to verify their identity and professional credentials before being listed. This protects patients from fraudulent providers and is required by anti-money-laundering regulations.</div>
        </details>
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">How long does verification take?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">Typically 24–48 hours. You will receive an in-app notification when your documents are approved or if a rejection reason is provided. You can re-upload rejected documents immediately.</div>
        </details>
      </div>
    </section>

    <section>
      <h2 class="text-xl font-semibold text-foreground">Medical &amp; legal</h2>
      <div class="mt-4 space-y-2">
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">Does Wishubest provide medical advice?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">No. Wishubest is a marketplace that connects patients with providers. We do not provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider with any medical questions.</div>
        </details>
        <details class="group rounded-[14px] border border-divider bg-surface transition-colors open:bg-surface-secondary/50">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-foreground">Can I get a translator for my appointment?<span class="material-symbols-outlined shrink-0 text-muted-foreground transition-transform group-open:rotate-180" style="font-size: 20px" aria-hidden>expand_more</span></summary>
          <div class="border-t border-divider px-4 py-3 text-sm leading-relaxed text-muted-foreground">Yes. Translators are listed as a provider type and can be booked alongside your medical appointment. Translators cover 5 languages: English, Turkish, Persian, Arabic, and Russian.</div>
        </details>
      </div>
    </section>
  </div>

  <div class="mt-16 rounded-[24px] border border-divider bg-gradient-to-br from-primary/5 to-transparent p-8 text-center sm:p-12">
    <h2 class="text-2xl font-bold text-foreground">Still have questions?</h2>
    <p class="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">Our support team is here to help. Reach out and we'll respond within 24 hours.</p>
    <a href="/en/contact" class="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"><span class="material-symbols-outlined" style="font-size: 18px" aria-hidden>contact_support</span>Contact us</a>
  </div>
`)

const TERMS_HTML = wrap('Terms of Service', `
  <p class="mt-2 text-sm text-muted-foreground">Last updated: August 2026</p>

  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">1. Acceptance of terms</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">By accessing or using Wishubest (the "Platform"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, you may not access or use the Platform.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">2. Description of service</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Wishubest is an online marketplace that connects patients with verified doctors, hospitals, accommodations, and translators for medical tourism. We facilitate discovery, communication, and booking but are not a healthcare provider, insurer, or travel agent. We do not provide medical advice, diagnosis, or treatment.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">3. Eligibility &amp; accounts</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">You must be at least 18 years old and legally capable of entering into contracts to use the Platform. You agree to provide accurate, current, and complete information during registration and to keep your account information updated. You are responsible for maintaining the confidentiality of your credentials and for all activity under your account.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">4. Provider verification (KYC)</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Providers (doctors, hospitals, hotels, translators) must complete our KYC verification process before being listed as "verified". Verification includes identity documents and, where required, professional licenses. Wishubest reserves the right to suspend or remove any provider whose credentials cannot be confirmed or who breaches these Terms.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">5. Bookings &amp; payments</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Bookings made through the Platform are subject to the cancellation policy displayed on each provider's listing. Platform payments are escrowed and released to the provider only after a booking is confirmed. Wishubest charges a platform commission on completed bookings, the rate of which is published per provider type in the dashboard. Taxes, where applicable, are the responsibility of the provider or patient as required by local law.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">6. Affiliate program</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Affiliates earn a flat percentage of the platform's commission on referred bookings — e.g. if the platform earns 30% commission on a booking, an affiliate with a 25% rate earns 25% of that 30%. There is no multi-level marketing: you only earn on your direct referrals.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">7. Prohibited conduct</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">You agree not to:</p><ul class="mt-2 list-disc ps-6 text-muted-foreground"><li class="my-1">Violate any applicable law or regulation.</li><li class="my-1">Impersonate another person or misrepresent your credentials.</li><li class="my-1">Submit false, misleading, or fraudulent KYC documents.</li><li class="my-1">Interfere with the Platform's security, integrity, or availability.</li><li class="my-1">Use the Platform to transmit medical advice, content, or materials that are unlawful, defamatory, or infringe intellectual property rights.</li><li class="my-1">Circumvent the Platform to avoid fees or commissions.</li></ul></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">8. Medical disclaimer</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">The Platform does not provide medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider with any questions you may have regarding a medical condition. Never disregard professional medical advice or delay seeking it because of something you read on the Platform. Wishubest is not liable for the medical decisions or outcomes of any patient-provider relationship formed via the Platform.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">9. Limitation of liability</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">To the maximum extent permitted by law, Wishubest, its directors, employees, and affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or goodwill, arising out of or related to your use of the Platform.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">10. Changes to these terms</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">We may modify these Terms from time to time. Material changes will be announced via the Platform or by email. Continued use after the effective date constitutes acceptance of the revised Terms.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">11. Governing law</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">These Terms are governed by the laws of the jurisdiction in which Wishubest is incorporated, without regard to conflict-of-law principles. Any disputes shall be submitted to the exclusive jurisdiction of the competent courts of that jurisdiction.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">12. Contact</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Questions about these Terms can be sent to <a href="mailto:legal@wishubest.com" class="text-primary underline">legal@wishubest.com</a> or via our <a href="/en/contact" class="text-primary underline">contact page</a>.</p></section>
`)

const PRIVACY_HTML = wrap('Privacy Policy', `
  <p class="mt-2 text-sm text-muted-foreground">Last updated: August 2026</p>

  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">1. Overview</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Wishubest ("we", "us") respects your privacy. This Policy explains what data we collect, why we collect it, how long we keep it, and the rights you have over it. We comply with applicable data-protection laws including the EU GDPR and any local laws of the jurisdictions in which we operate.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">2. Data we collect</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Account data: name, email, phone, country, city, preferred language. Profile data: role (patient/doctor/hospital/hotel/translator/affiliate), specialty, professional license number. KYC documents: government ID, professional licenses, liveness videos — stored locally on our server, never as Base64 in the database. Booking data: appointment requests, provider communications, payment metadata. Medical records you choose to upload and share with providers.</p><p class="mt-4 text-base leading-relaxed text-muted-foreground">Usage logs: IP address, browser type, pages visited, timestamps. Cookies: session cookie, locale preference, affiliate referral cookie (30-day expiry).</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">3. How we use your data</h2><ul class="mt-2 list-disc ps-6 text-muted-foreground"><li class="my-1">To provide, operate, and improve the Platform and its features.</li><li class="my-1">To verify provider identity and credentials (KYC) before listing.</li><li class="my-1">To process bookings, payments, refunds, and affiliate commissions.</li><li class="my-1">To send service notifications, security alerts, and (with consent) marketing communications.</li><li class="my-1">To comply with legal obligations and prevent fraud or abuse.</li></ul></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">4. Legal basis (GDPR)</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">We process personal data on the following legal bases: Consent (marketing communications and non-essential cookies), Contract (to fulfill bookings and provider agreements), Legal obligation (KYC and tax record retention), Legitimate interest (security logging, fraud prevention).</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">5. Data retention</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">We retain personal data only as long as necessary for the purposes set out above or as required by law. KYC documents are retained for the duration of the provider relationship plus the statutory retention period (typically 5–7 years for anti-money-laundering compliance). Booking records are retained for 7 years for tax and dispute purposes. You may request deletion of non-mandatory data at any time.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">6. Sharing of data</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">We do not sell your personal data. We share data only with: Providers you book with (your name, contact details, and relevant medical records you consented to share), Payment processors (strictly the data needed to complete a transaction), Authorities (when legally required or to prevent fraud/abuse), Service providers (hosting, email, analytics — under data-processing agreements).</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">7. File storage</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Uploaded files (KYC documents, medical records, media library assets) are saved to the local filesystem on our server under <code class="rounded bg-surface-secondary px-1.5 py-0.5 text-xs">public/uploads/&lt;category&gt;/</code> and referenced by relative URL in the database. Files are never embedded as Base64 in database columns.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">8. Cookies</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">We use essential cookies (session, locale) and a 30-day affiliate referral cookie. Non-essential cookies require your consent, which you can manage via your browser settings.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">9. Your rights</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Subject to applicable law, you have the right to: Access the personal data we hold about you, Rectify inaccurate data, Erasure ("right to be forgotten") of non-mandatory data, Restrict or object to processing, Data portability, Withdraw consent at any time. To exercise these rights, contact <a href="mailto:privacy@wishubest.com" class="text-primary underline">privacy@wishubest.com</a> or via our <a href="/en/contact" class="text-primary underline">contact page</a>.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">10. Security</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">We use industry-standard measures to protect your data: TLS for transit, scrypt for password hashing, HMAC-signed session cookies, role-based access control, and local filesystem isolation for uploaded files.</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">11. International transfers</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">Your data may be processed in countries other than your own. By using the Platform, you consent to such transfers subject to appropriate safeguards (Standard Contractual Clauses or equivalent).</p></section>
  <section class="mt-8"><h2 class="text-2xl font-semibold text-foreground">12. Changes to this policy</h2><p class="mt-4 text-base leading-relaxed text-muted-foreground">We may update this Policy from time to time. Material changes will be announced via the Platform or by email. Continued use after the effective date constitutes acceptance.</p></section>
`)

type StaticPage = {
  slug: string
  title: string
  htmlContent: string
}

const PAGES: StaticPage[] = [
  { slug: 'about', title: 'About Wishubest', htmlContent: ABOUT_HTML },
  { slug: 'faq', title: 'Frequently Asked Questions', htmlContent: FAQ_HTML },
  { slug: 'terms', title: 'Terms of Service', htmlContent: TERMS_HTML },
  { slug: 'privacy', title: 'Privacy Policy', htmlContent: PRIVACY_HTML },
]

async function main() {
  console.log('🌱 Seeding static Custom Pages (en)…')

  let created = 0
  let updated = 0

  for (const page of PAGES) {
    const existing = await db.customPage.findFirst({
      where: { slug: page.slug, language: 'en' },
    })

    if (existing) {
      await db.customPage.update({
        where: { id: existing.id },
        data: {
          title: page.title,
          htmlContent: page.htmlContent,
          isPublished: true,
        },
      })
      console.log(`  ⬆  Updated: ${page.slug} (en)`)
      updated++
    } else {
      await db.customPage.create({
        data: {
          title: page.title,
          slug: page.slug,
          language: 'en',
          htmlContent: page.htmlContent,
          isPublished: true,
        },
      })
      console.log(`  ✅ Created: ${page.slug} (en)`)
      created++
    }
  }

  console.log(`\n✅ Done. Created ${created}, updated ${updated}.`)
  console.log('\n📋 To create translations:')
  console.log('  1. Go to Admin → Custom Pages → New Page')
  console.log('  2. Set the same slug (e.g. "about") but language = "fa"')
  console.log('  3. Add your translated content')
  console.log('  4. The [locale]/[slug] route serves the right locale automatically')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
