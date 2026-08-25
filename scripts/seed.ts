import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

async function main() {
  console.log('🌱 Seeding database…')

  const commissionDefaults: [string, string][] = [
    ['DOCTOR', '15'],
    ['HOSPITAL', '10'],
    ['HOTEL', '12'],
    ['TRANSLATOR', '18'],
  ]
  for (const [pt, rate] of commissionDefaults) {
    await db.commissionRate.upsert({
      where: { providerType: pt as any },
      update: { rate },
      create: { providerType: pt as any, rate },
    })
    await db.cancellationPolicy.upsert({
      where: { providerType: pt as any },
      update: {},
      create: { providerType: pt as any, freeCancellationHours: 24, cancellationFeePercent: pt === 'HOTEL' ? '10' : '20' },
    })
  }

  await db.setting.upsert({ where: { key: 'payoutScheduleDays' }, update: {}, create: { key: 'payoutScheduleDays', value: '7' } })
  await db.setting.upsert({ where: { key: 'defaultCurrency' }, update: {}, create: { key: 'defaultCurrency', value: 'USD' } })
  await db.setting.upsert({ where: { key: 'platformName' }, update: {}, create: { key: 'platformName', value: 'Wishubest' } })

  await db.user.upsert({
    where: { email: 'admin@wishubest.com' },
    update: {},
    create: {
      email: 'admin@wishubest.com',
      passwordHash: hashPassword('admin123'),
      role: 'ADMIN',
      status: 'ACTIVE',
      name: 'Platform Admin',
      preferredLanguage: 'en',
    },
  })

  const patientUser = await db.user.upsert({
    where: { email: 'patient@wishubest.com' },
    update: {},
    create: {
      email: 'patient@wishubest.com',
      passwordHash: hashPassword('patient123'),
      role: 'PATIENT',
      status: 'ACTIVE',
      name: 'Sara Ahmadi',
      preferredLanguage: 'en',
      phone: '+98 912 000 0000',
      country: 'Iran',
      city: 'Tehran',
    },
  })
  await db.patient.upsert({
    where: { userId: patientUser.id },
    update: {},
    create: {
      userId: patientUser.id,
      dateOfBirth: '1990-05-12',
      gender: 'Female',
      bloodGroup: 'O+',
      passportNumber: 'A12345678',
    },
  })

  const doctors = [
    {
      email: 'doctor@wishubest.com', name: 'Dr. Mehmet Yilmaz', specialty: 'Cardiology',
      subSpecialties: 'Interventional Cardiology,ECG', city: 'Istanbul', country: 'Turkey',
      yearsExperience: 14, fee: '180', onlineFee: '90', languages: 'en,tr',
      education: 'Istanbul University Faculty of Medicine', certifications: 'ESC, TSC',
      bio: 'Interventional cardiologist with 14 years of experience in coronary interventions and structural heart disease.',
    },
    {
      email: 'doctor2@wishubest.com', name: 'Dr. Layla Hosseini', specialty: 'Dermatology',
      subSpecialties: 'Cosmetic Dermatology,Laser', city: 'Tehran', country: 'Iran',
      yearsExperience: 9, fee: '120', onlineFee: '60', languages: 'en,fa,ar',
      education: 'Tehran University of Medical Sciences', certifications: 'ISDS',
      bio: 'Board-certified dermatologist specializing in cosmetic procedures and laser therapy.',
    },
  ]
  for (const d of doctors) {
    const u = await db.user.upsert({
      where: { email: d.email },
      update: {},
      create: {
        email: d.email, passwordHash: hashPassword('doctor123'), role: 'DOCTOR', status: 'ACTIVE',
        name: d.name, preferredLanguage: 'en', city: d.city, country: d.country,
      },
    })
    const doc = await db.doctor.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id, specialty: d.specialty, subSpecialties: d.subSpecialties, bio: d.bio,
        city: d.city, country: d.country, yearsExperience: d.yearsExperience,
        consultationFee: d.fee, onlineFee: d.onlineFee, languages: d.languages,
        education: d.education, certifications: d.certifications, verified: true,
        rating: d.email === 'doctor@wishubest.com' ? 4.8 : 4.6, reviewCount: d.email === 'doctor@wishubest.com' ? 32 : 18,
      },
    })
    await db.service.create({
      data: {
        providerType: 'DOCTOR', doctorId: doc.id, name: `${d.specialty} consultation`,
        description: `${d.specialty} in-person consultation (45 min)`, price: d.fee, currency: 'USD', durationMinutes: 45,
      },
    })
    await db.service.create({
      data: {
        providerType: 'DOCTOR', doctorId: doc.id, name: `${d.specialty} online consultation`,
        description: `${d.specialty} remote video consultation (30 min)`, price: d.onlineFee, currency: 'USD', durationMinutes: 30,
      },
    })
    const now = new Date()
    for (let i = 1; i <= 5; i++) {
      const start = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
      start.setHours(9, 0, 0, 0)
      for (const [h, vt] of [[10, 'IN_PERSON'], [11, 'IN_PERSON'], [14, 'ONLINE'], [15, 'ONLINE']] as [number, string][]) {
        const s = new Date(start)
        s.setHours(h, 0, 0, 0)
        const e = new Date(s)
        e.setMinutes(s.getMinutes() + 60)
        await db.slot.create({
          data: { doctorId: doc.id, startTime: s, endTime: e, visitType: vt as any, isBooked: false },
        })
      }
    }
  }

  const hospitals = [
    {
      email: 'hospital@wishubest.com', name: 'Anadolu Medical Center', city: 'Istanbul', country: 'Turkey',
      departments: 'Cardiology,Oncology,Orthopedics,Neurology', accreditations: 'JCI,ISO', beds: 250, fee: '350',
      languages: 'en,tr', description: 'JCI-accredited comprehensive medical center with international patient services.',
    },
    {
      email: 'hospital2@wishubest.com', name: 'Pars Hospital', city: 'Tehran', country: 'Iran',
      departments: 'General Surgery,Internal Medicine,Maternity', accreditations: 'ISO', beds: 180, fee: '220',
      languages: 'en,fa,ar', description: 'Leading private hospital offering a full range of surgical and medical services.',
    },
  ]
  for (const h of hospitals) {
    const u = await db.user.upsert({
      where: { email: h.email },
      update: {},
      create: {
        email: h.email, passwordHash: hashPassword('hospital123'), role: 'HOSPITAL', status: 'ACTIVE',
        name: h.name, preferredLanguage: 'en', city: h.city, country: h.country,
      },
    })
    const hosp = await db.hospital.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id, name: h.name, description: h.description, address: `${h.city} downtown`, city: h.city, country: h.country,
        departments: h.departments, accreditations: h.accreditations, beds: h.beds, baseFee: h.fee, languages: h.languages,
        verified: true, rating: h.email === 'hospital@wishubest.com' ? 4.7 : 4.4, reviewCount: h.email === 'hospital@wishubest.com' ? 56 : 24,
      },
    })
    await db.service.create({
      data: { providerType: 'HOSPITAL', hospitalId: hosp.id, name: 'Comprehensive health check-up',
        description: 'Full-day diagnostic package including lab work and imaging.', price: h.fee, currency: 'USD', durationMinutes: 480 },
    })
    const now = new Date()
    for (let i = 1; i <= 5; i++) {
      const s = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
      s.setHours(8, 0, 0, 0)
      const e = new Date(s); e.setHours(12, 0, 0, 0)
      await db.slot.create({ data: { hospitalId: hosp.id, startTime: s, endTime: e, visitType: 'IN_PERSON', isBooked: false } })
    }
  }

  const hotels = [
    {
      email: 'hotel@wishubest.com', name: 'Bosphorus Recovery Suites', city: 'Istanbul', country: 'Turkey',
      starRating: 5, amenities: 'WiFi,Room Service,Medical Bed,Wheelchair Access,Spa', roomTypes: 'Standard Suite,Medical Suite',
      price: '120', languages: 'en,tr', description: 'Recovery-focused suites near major hospitals, with medical beds available.',
    },
    {
      email: 'hotel2@wishubest.com', name: 'Tehran Medical Stay', city: 'Tehran', country: 'Iran',
      starRating: 4, amenities: 'WiFi,Breakfast,Shuttle,Wheelchair Access', roomTypes: 'Single,Double',
      price: '65', languages: 'en,fa', description: 'Comfortable accommodations with hospital shuttle service.',
    },
  ]
  for (const h of hotels) {
    const u = await db.user.upsert({
      where: { email: h.email },
      update: {},
      create: {
        email: h.email, passwordHash: hashPassword('hotel123'), role: 'HOTEL', status: 'ACTIVE',
        name: h.name, preferredLanguage: 'en', city: h.city, country: h.country,
      },
    })
    const hotel = await db.hotel.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id, name: h.name, description: h.description, address: `${h.city} center`, city: h.city, country: h.country,
        starRating: h.starRating, amenities: h.amenities, roomTypes: h.roomTypes, pricePerNight: h.price, languages: h.languages,
        verified: true, rating: h.email === 'hotel@wishubest.com' ? 4.5 : 4.3, reviewCount: h.email === 'hotel@wishubest.com' ? 41 : 12,
      },
    })
    await db.service.create({
      data: { providerType: 'HOTEL', hotelId: hotel.id, name: 'Medical Suite (per night)',
        description: 'Recovery suite with medical bed and 24/7 nurse call.', price: h.price, currency: 'USD' },
    })
  }

  const translators = [
    {
      email: 'translator@wishubest.com', name: 'Omar Khalil', languages: 'en,ar,tr', specialization: 'medical',
      city: 'Istanbul', country: 'Turkey', hourly: '35', daily: '220', years: 7,
      bio: 'Medical translator fluent in Arabic, English and Turkish. Specialized in hospital appointments.',
    },
    {
      email: 'translator2@wishubest.com', name: 'Niloofar Rezaei', languages: 'en,fa,ar', specialization: 'medical',
      city: 'Tehran', country: 'Iran', hourly: '28', daily: '180', years: 5,
      bio: 'Persian-English-Arabic medical translator with experience in surgical consultations.',
    },
  ]
  for (const t of translators) {
    const u = await db.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email, passwordHash: hashPassword('translator123'), role: 'TRANSLATOR', status: 'ACTIVE',
        name: t.name, preferredLanguage: 'en', city: t.city, country: t.country,
      },
    })
    const tr = await db.translator.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id, languages: t.languages, specialization: t.specialization, bio: t.bio,
        city: t.city, country: t.country, hourlyRate: t.hourly, dailyRate: t.daily, yearsExperience: t.years,
        verified: true, rating: t.email === 'translator@wishubest.com' ? 4.9 : 4.7, reviewCount: t.email === 'translator@wishubest.com' ? 28 : 15,
      },
    })
    await db.service.create({
      data: { providerType: 'TRANSLATOR', translatorId: tr.id, name: 'Medical translation (per hour)',
        description: 'On-site medical translation during appointments.', price: t.hourly, currency: 'USD', durationMinutes: 60 },
    })
    await db.service.create({
      data: { providerType: 'TRANSLATOR', translatorId: tr.id, name: 'Full-day translation',
        description: 'Full-day (8h) medical translation support.', price: t.daily, currency: 'USD', durationMinutes: 480 },
    })
    const now = new Date()
    for (let i = 1; i <= 4; i++) {
      const s = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
      s.setHours(9, 0, 0, 0)
      const e = new Date(s); e.setHours(17, 0, 0, 0)
      await db.slot.create({ data: { translatorId: tr.id, startTime: s, endTime: e, visitType: 'IN_PERSON', isBooked: false } })
    }
  }

  const pendingUser = await db.user.upsert({
    where: { email: 'pending.doc@wishubest.com' },
    update: {},
    create: {
      email: 'pending.doc@wishubest.com', passwordHash: hashPassword('doctor123'), role: 'DOCTOR', status: 'PENDING',
      name: 'Dr. Carlos Mendez', preferredLanguage: 'en', city: 'Madrid', country: 'Spain',
    },
  })
  await db.doctor.upsert({
    where: { userId: pendingUser.id },
    update: {},
    create: {
      userId: pendingUser.id, specialty: 'Orthopedics', subSpecialties: 'Sports Medicine', bio: 'Pending verification.',
      city: 'Madrid', country: 'Spain', yearsExperience: 8, consultationFee: '150', onlineFee: '75',
      languages: 'en,es', education: 'Complutense University of Madrid', certifications: 'AAOS', verified: false,
    },
  })

  console.log('✅ Seed complete.')
  console.log('   Admin:      admin@wishubest.com / admin123')
  console.log('   Patient:    patient@wishubest.com / patient123')
  console.log('   Doctor:     doctor@wishubest.com / doctor123')
  console.log('   Hospital:   hospital@wishubest.com / hospital123')
  console.log('   Hotel:      hotel@wishubest.com / hotel123')
  console.log('   Translator: translator@wishubest.com / translator123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
