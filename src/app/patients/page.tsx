import { RoleLandingPage, type RoleLandingConfig } from '@/components/landing/role-landing-page'

const config: RoleLandingConfig = {
  role: 'PATIENT',
  heroTitle: 'World-class healthcare, anywhere in the world.',
  heroSubtitle: 'Compare verified doctors, hospitals, accommodations, and translators. Book in minutes — pay securely through the platform.',
  heroImage: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80',
  accentColor: 'bg-primary/10 text-primary',
  ctaText: 'Find care now',
  statCards: [
    { value: '500+', label: 'Providers', icon: 'verified' },
    { value: '4.8★', label: 'Avg rating', icon: 'star' },
    { value: '50k+', label: 'Patients served', icon: 'group' },
  ],
  features: [
    { icon: 'compare', title: 'Compare prices & reviews', desc: 'See doctors, hospitals, hotels and translators side by side before you decide.' },
    { icon: 'lock', title: 'Secure platform payments', desc: 'Every payment goes through us. Your money is protected until your service is complete.' },
    { icon: 'verified_user', title: 'Verified providers', desc: 'Every doctor, hospital, hotel and translator is reviewed by our team.' },
    { icon: 'language', title: 'Speak your language', desc: 'Full support in English, Turkish, Persian and Arabic — including right-to-left layouts.' },
    { icon: 'videocam', title: 'Online consultations', desc: 'Book video consultations with doctors from anywhere in the world.' },
    { icon: 'event', title: 'Easy booking', desc: 'Pick a time slot, pay securely, and manage all your appointments in one place.' },
  ],
}

export default function Page() { return <RoleLandingPage config={config} /> }
