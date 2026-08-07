import { RoleLandingPage, type RoleLandingConfig } from '@/components/landing/role-landing-page'

const config: RoleLandingConfig = {
  role: 'HOSPITAL',
  heroTitle: 'Showcase your facility to a global audience.',
  heroSubtitle: 'List your hospital, manage departments, and attract international patients with a verified profile on MedTravel.',
  heroImage: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=800&q=80',
  accentColor: 'bg-warning/10 text-warning',
  ctaText: 'List your hospital',
  statCards: [
    { value: '250+', label: 'Hospitals', icon: 'local_hospital' },
    { value: '40+', label: 'Countries', icon: 'public' },
    { value: 'JCI', label: 'Accredited', icon: 'verified' },
  ],
  features: [
    { icon: 'public', title: 'International visibility', desc: 'Reach patients from 90+ countries looking for quality medical care abroad.' },
    { icon: 'apartment', title: 'Department management', desc: 'Showcase all your departments, services, and accreditations in one profile.' },
    { icon: 'payments', title: 'Transparent settlements', desc: 'Track every booking with detailed accounting and automated settlement batches.' },
    { icon: 'analytics', title: 'Performance insights', desc: 'Monitor patient acquisition, revenue trends, and department performance.' },
    { icon: 'verified', title: 'Verified badge', desc: 'Build trust with JCI/ISO accreditation display and verified status.' },
    { icon: 'support_agent', title: 'Dedicated support', desc: 'Get priority support for onboarding, profile optimization, and dispute resolution.' },
  ],
}

export default function Page() { return <RoleLandingPage config={config} /> }
