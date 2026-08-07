import { RoleLandingPage, type RoleLandingConfig } from '@/components/landing/role-landing-page'

const config: RoleLandingConfig = {
  role: 'TRANSLATOR',
  heroTitle: 'Bridge the language gap for medical travelers.',
  heroSubtitle: 'Offer your translation services to patients traveling for medical care. Set your rates, manage availability, and get paid securely.',
  heroImage: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80',
  accentColor: 'bg-error/10 text-error',
  ctaText: 'Join as translator',
  statCards: [
    { value: '200+', label: 'Translators', icon: 'translate' },
    { value: '20+', label: 'Languages', icon: 'language' },
    { value: '4.7★', label: 'Avg rating', icon: 'star' },
  ],
  features: [
    { icon: 'translate', title: 'Multi-language support', desc: 'Offer translation in medical, legal, and general contexts across multiple language pairs.' },
    { icon: 'payments', title: 'Flexible pricing', desc: 'Set hourly and daily rates. Get paid securely through the platform after each service.' },
    { icon: 'calendar_month', title: 'Availability management', desc: 'Control your schedule with slot-based availability and recurring time blocks.' },
    { icon: 'verified', title: 'Verified profile', desc: 'Get verified and build trust with patients who need reliable translation.' },
    { icon: 'videocam', title: 'Remote support', desc: 'Offer online translation for telemedicine consultations alongside in-person services.' },
    { icon: 'reviews', title: 'Build reputation', desc: 'Collect patient reviews and grow your profile with each completed assignment.' },
  ],
}

export default function Page() { return <RoleLandingPage config={config} /> }
