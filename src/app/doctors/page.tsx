import { RoleLandingPage, type RoleLandingConfig } from '@/components/landing/role-landing-page'

const config: RoleLandingConfig = {
  role: 'DOCTOR',
  heroTitle: 'Grow your practice with global patients.',
  heroSubtitle: 'Reach international patients, manage appointments, and get paid securely. Join thousands of verified doctors on MedTravel.',
  heroImage: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=800&q=80',
  accentColor: 'bg-success/10 text-success',
  ctaText: 'Join as doctor',
  statCards: [
    { value: '10k+', label: 'Patients/month', icon: 'group' },
    { value: '85%', label: 'Avg payout', icon: 'payments' },
    { value: '4.8★', label: 'Satisfaction', icon: 'star' },
  ],
  features: [
    { icon: 'travel_explore', title: 'Global reach', desc: 'Connect with patients from around the world seeking your expertise.' },
    { icon: 'videocam', title: 'Online consultations', desc: 'Offer remote video consultations alongside in-person visits.' },
    { icon: 'payments', title: 'Secure payouts', desc: 'Get paid on time with transparent commission rates and weekly settlements.' },
    { icon: 'calendar_month', title: 'Smart scheduling', desc: 'Manage your availability with recurring slots and a calendar view.' },
    { icon: 'analytics', title: 'Analytics dashboard', desc: 'Track your earnings, booking trends, and patient conversion rates.' },
    { icon: 'verified', title: 'Verified badge', desc: 'Stand out with a verified profile that builds trust with patients.' },
  ],
}

export default function Page() { return <RoleLandingPage config={config} /> }
