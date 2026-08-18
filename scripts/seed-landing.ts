/**
 * Seed a professional default landing page as a CustomPage with slug "home".
 *
 * Usage: bun run scripts/seed-landing.ts
 *
 * Idempotent — if a CustomPage with slug "home" already exists, it is
 * updated (not duplicated).
 */
import { db } from '../src/lib/db'

const LANDING_HTML = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">

  <!-- Hero Section -->
  <section style="
    min-height: 600px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    text-align: center;
    padding: 80px 20px;
    position: relative;
    overflow: hidden;
  ">
    <div style="max-width: 800px; z-index: 1; position: relative;">
      <h1 style="font-size: 3.5rem; font-weight: 800; margin-bottom: 24px; line-height: 1.2;">
        Your Health, Anywhere in the World
      </h1>
      <p style="font-size: 1.5rem; margin-bottom: 40px; opacity: 0.95; line-height: 1.6;">
        Compare and book verified doctors, hospitals, and medical services across the globe.
        Quality care at affordable prices.
      </p>
      <a href="/dashboard" style="
        display: inline-block;
        background: white;
        color: #764ba2;
        padding: 16px 48px;
        border-radius: 50px;
        font-size: 1.2rem;
        font-weight: 700;
        text-decoration: none;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        Get Started
      </a>
    </div>
  </section>

  <!-- Features Section -->
  <section style="padding: 80px 20px; background: #f8f9fa;">
    <div style="max-width: 1200px; margin: 0 auto;">
      <h2 style="text-align: center; font-size: 2.5rem; font-weight: 700; color: #1a1a2e; margin-bottom: 60px;">
        Why Choose Wishubest?
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 40px;">

        <!-- Feature 1 -->
        <div style="text-align: center; padding: 40px 20px; background: white; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
          <div style="width: 72px; height: 72px; margin: 0 auto 24px; background: #e8f5e9; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px;">✓</div>
          <h3 style="font-size: 1.4rem; font-weight: 700; color: #1a1a2e; margin-bottom: 12px;">Verified Providers</h3>
          <p style="color: #666; line-height: 1.6;">Every doctor, hospital, and translator is verified through our rigorous KYC process.</p>
        </div>

        <!-- Feature 2 -->
        <div style="text-align: center; padding: 40px 20px; background: white; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
          <div style="width: 72px; height: 72px; margin: 0 auto 24px; background: #e3f2fd; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px;">🌍</div>
          <h3 style="font-size: 1.4rem; font-weight: 700; color: #1a1a2e; margin-bottom: 12px;">Global Network</h3>
          <p style="color: #666; line-height: 1.6;">Access healthcare providers in Turkey, India, Germany, UAE, Thailand, and more.</p>
        </div>

        <!-- Feature 3 -->
        <div style="text-align: center; padding: 40px 20px; background: white; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
          <div style="width: 72px; height: 72px; margin: 0 auto 24px; background: #fff3e0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px;">💰</div>
          <h3 style="font-size: 1.4rem; font-weight: 700; color: #1a1a2e; margin-bottom: 12px;">Affordable Care</h3>
          <p style="color: #666; line-height: 1.6;">Save up to 70% on medical procedures compared to local prices, without compromising quality.</p>
        </div>

      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section style="padding: 80px 20px; background: white;">
    <div style="max-width: 1000px; margin: 0 auto;">
      <h2 style="text-align: center; font-size: 2.5rem; font-weight: 700; color: #1a1a2e; margin-bottom: 60px;">
        How It Works
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 40px;">
        <div style="text-align: center;">
          <div style="width: 56px; height: 56px; margin: 0 auto 20px; background: #764ba2; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;">1</div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: #1a1a2e; margin-bottom: 8px;">Describe Your Needs</h3>
          <p style="color: #666; line-height: 1.6;">Use our AI symptom checker or browse providers directly.</p>
        </div>
        <div style="text-align: center;">
          <div style="width: 56px; height: 56px; margin: 0 auto 20px; background: #764ba2; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;">2</div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: #1a1a2e; margin-bottom: 8px;">Compare & Book</h3>
          <p style="color: #666; line-height: 1.6;">Compare verified providers by rating, price, and location. Book in seconds.</p>
        </div>
        <div style="text-align: center;">
          <div style="width: 56px; height: 56px; margin: 0 auto 20px; background: #764ba2; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;">3</div>
          <h3 style="font-size: 1.2rem; font-weight: 700; color: #1a1a2e; margin-bottom: 8px;">Travel & Heal</h3>
          <p style="color: #666; line-height: 1.6;">Receive your treatment abroad with full support — translators, hotels, and more.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section style="padding: 80px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center; color: white;">
    <div style="max-width: 600px; margin: 0 auto;">
      <h2 style="font-size: 2.5rem; font-weight: 700; margin-bottom: 20px;">
        Ready to Start Your Medical Journey?
      </h2>
      <p style="font-size: 1.2rem; margin-bottom: 40px; opacity: 0.95;">
        Join thousands of patients who found quality, affordable care abroad.
      </p>
      <a href="/dashboard" style="
        display: inline-block;
        background: white;
        color: #764ba2;
        padding: 16px 48px;
        border-radius: 50px;
        font-size: 1.2rem;
        font-weight: 700;
        text-decoration: none;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      ">
        Create Free Account
      </a>
    </div>
  </section>

  <!-- Footer -->
  <footer style="padding: 40px 20px; background: #1a1a2e; color: #888; text-align: center;">
    <p style="font-size: 0.9rem;">&copy; 2025 Wishubest. Global Medical Tourism Marketplace. All rights reserved.</p>
  </footer>

</div>
`

async function main() {
  console.log('🌱 Seeding default landing page…')

  await db.customPage.upsert({
    where: { slug_language: { slug: 'home', language: 'en' } },
    update: {
      title: 'Home',
      htmlContent: LANDING_HTML,
      isPublished: true,
    },
    create: {
      title: 'Home',
      slug: 'home',
      htmlContent: LANDING_HTML,
      isPublished: true,
      seoTitle: 'Wishubest — Global Medical Tourism Marketplace',
      seoDescription: 'Compare and book verified doctors, hospitals, accommodations and translators worldwide.',
    },
  })

  // Also seed default site settings
  const defaultSettings = [
    { key: 'siteName', value: 'Wishubest' },
    { key: 'tagline', value: 'Global Medical Tourism Marketplace' },
    { key: 'defaultSeoTitle', value: 'Wishubest — Global Medical Tourism Marketplace' },
    { key: 'defaultSeoDescription', value: 'Compare and book verified doctors, hospitals, accommodations and translators worldwide.' },
  ]

  for (const s of defaultSettings) {
    await db.siteSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    })
  }

  console.log('✅ Landing page and site settings seeded successfully.')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
