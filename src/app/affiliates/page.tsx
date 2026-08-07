import { RoleLandingPage, type RoleLandingConfig } from '@/components/landing/role-landing-page'

const config: RoleLandingConfig = {
  role: 'AFFILIATE',
  heroTitle: 'Earn commissions by referring patients to MedTravel.',
  heroSubtitle: 'Share your referral link, earn commission on every booking, and climb the tier ladder for bonus rates. It\'s that simple.',
  heroImage: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
  accentColor: 'bg-[#007B83]/10 text-[#007B83]',
  ctaText: 'Become an affiliate',
  statCards: [
    { value: '3-6%', label: 'Commission', icon: 'percent' },
    { value: '4', label: 'Tier levels', icon: 'workspace_premium' },
    { value: '$2k+', label: 'Top earners', icon: 'payments' },
  ],
  features: [
    { icon: 'campaign', title: 'Promo materials', desc: 'Get QR codes, social media templates, and banners to help you refer more patients.' },
    { icon: 'workspace_premium', title: 'Tier system', desc: 'Start at Bronze and climb to Platinum with bonus commission rates at each level.' },
    { icon: 'payments', title: 'Secure payouts', desc: 'Track your earnings in real-time and get paid monthly via bank transfer.' },
    { icon: 'analytics', title: 'Analytics dashboard', desc: 'Monitor clicks, signups, bookings, and conversion rates with detailed charts.' },
    { icon: 'share', title: 'Easy sharing', desc: 'Share your link on WhatsApp, Telegram, X, Facebook, and email with one click.' },
    { icon: 'group', title: 'Refer any role', desc: 'Earn commission when you refer patients, doctors, hospitals, hotels, or translators.' },
  ],
}

export default function Page() { return <RoleLandingPage config={config} /> }
