import { RoleLandingPage, type RoleLandingConfig } from '@/components/landing/role-landing-page'

const config: RoleLandingConfig = {
  role: 'HOTEL',
  heroTitle: 'Host recovering patients and medical travelers.',
  heroSubtitle: 'Fill your rooms with medical tourists. List your hotel or recovery suite on MedTravel and connect with patients traveling for care.',
  heroImage: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80',
  accentColor: 'bg-[#9334E6]/10 text-[#9334E6]',
  ctaText: 'List your property',
  statCards: [
    { value: '180+', label: 'Properties', icon: 'hotel' },
    { value: '92%', label: 'Occupancy', icon: 'trending_up' },
    { value: '4.5★', label: 'Avg rating', icon: 'star' },
  ],
  features: [
    { icon: 'hotel', title: 'Medical-friendly listings', desc: 'Highlight medical beds, wheelchair access, and recovery amenities for medical travelers.' },
    { icon: 'payments', title: 'Platform payments', desc: 'Patients pay through the platform — no invoicing, no chasing payments.' },
    { icon: 'calendar_month', title: 'Booking calendar', desc: 'Manage availability and reservations with an intuitive calendar system.' },
    { icon: 'verified', title: 'Verified property', desc: 'Stand out with a verified badge that assures patients of quality standards.' },
    { icon: 'reviews', title: 'Review system', desc: 'Build your reputation with patient reviews and respond to feedback.' },
    { icon: 'shuttle', title: 'Hospital proximity', desc: 'Connect with nearby hospitals and offer shuttle services to patients.' },
  ],
}

export default function Page() { return <RoleLandingPage config={config} /> }
