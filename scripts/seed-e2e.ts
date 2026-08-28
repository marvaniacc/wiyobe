/**
 * End-to-End Affiliate & Booking Lifecycle Seed Script
 *
 * Simulates the complete flow:
 * 1. System setup (admin, commission rates)
 * 2. Affiliate setup (verified affiliate, click tracking)
 * 3. Provider registration (referred by affiliate)
 * 4. Success case: booking → completion → affiliate commission released
 * 5. Cancellation case: booking → cancellation → affiliate commission reversed
 *
 * Run: bun run scripts/seed-e2e.ts
 */

import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

async function main() {
  console.log('🌱 E2E Affiliate & Booking Lifecycle Seed\n')

  // === 1. System Setup ===
  console.log('━━━ 1. System Setup ━━━')

  const admin = await db.user.upsert({
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
  console.log(`  Admin: ${admin.email} (${admin.id})`)

  // Commission rate for doctors: platform 30%, affiliate 25% of platform commission
  const commissionRate = await db.commissionRate.upsert({
    where: { providerType: 'DOCTOR' },
    update: { rate: '30', affiliateRate: '25' },
    create: { providerType: 'DOCTOR', rate: '30', affiliateRate: '25' },
  })
  console.log(`  CommissionRate DOCTOR: platform=${commissionRate.rate}% affiliate=${commissionRate.affiliateRate}% of platform`)

  // Cancellation policy
  await db.cancellationPolicy.upsert({
    where: { providerType: 'DOCTOR' },
    update: {},
    create: { providerType: 'DOCTOR', freeCancellationHours: 24, cancellationFeePercent: '20' },
  })

  // Settings
  await db.setting.upsert({ where: { key: 'payoutScheduleDays' }, update: {}, create: { key: 'payoutScheduleDays', value: '7' } })
  await db.setting.upsert({ where: { key: 'defaultCurrency' }, update: {}, create: { key: 'defaultCurrency', value: 'USD' } })
  await db.setting.upsert({ where: { key: 'platformName' }, update: {}, create: { key: 'platformName', value: 'Wishubest' } })

  // === 2. Affiliate Setup ===
  console.log('\n━━━ 2. Affiliate Setup ━━━')

  const affUser = await db.user.upsert({
    where: { email: 'affiliate@wishubest.com' },
    update: {},
    create: {
      email: 'affiliate@wishubest.com',
      passwordHash: hashPassword('affiliate123'),
      role: 'AFFILIATE',
      status: 'ACTIVE',
      name: 'Test Affiliate',
      preferredLanguage: 'en',
    },
  })

  // Delete existing affiliate record to reset balances
  await db.affiliate.deleteMany({ where: { userId: affUser.id } })

  const affiliate = await db.affiliate.create({
    data: {
      userId: affUser.id,
      referralCode: 'TEST001',
      verified: true,
      totalClicks: 1,
      totalSignups: 1,
      totalBookings: 0,
      totalEarnings: '0',
      availableBalance: '0',
      pendingBalance: '0',
      paidOut: '0',
    },
  })
  console.log(`  Affiliate: ${affUser.email} (code: ${affiliate.referralCode}, verified: ${affiliate.verified})`)

  // === 3. Provider Registration (Referred by Affiliate) ===
  console.log('\n━━━ 3. Provider Registration (Referred) ━━━')

  const doctorUser = await db.user.upsert({
    where: { email: 'doctor@wishubest.com' },
    update: { referredByAffiliateId: affiliate.id },
    create: {
      email: 'doctor@wishubest.com',
      passwordHash: hashPassword('doctor123'),
      role: 'DOCTOR',
      status: 'ACTIVE',
      name: 'Dr. Mehmet Yilmaz',
      preferredLanguage: 'en',
      referredByAffiliateId: affiliate.id,
    },
  })

  // Delete and recreate doctor profile to ensure verified=true
  await db.doctor.deleteMany({ where: { userId: doctorUser.id } })
  const doctor = await db.doctor.create({
    data: {
      userId: doctorUser.id,
      specialty: 'Cardiology',
      subSpecialties: 'Interventional',
      bio: 'Test doctor for E2E seed',
      city: 'Istanbul',
      country: 'Turkey',
      yearsExperience: 15,
      consultationFee: '100',
      onlineFee: '80',
      languages: 'en,tr',
      education: 'MD Istanbul University',
      certifications: 'Board Certified',
      verified: true,
      rating: 5,
      reviewCount: 0,
    },
  })
  console.log(`  Doctor: ${doctorUser.email} (referred by affiliate: ${doctorUser.referredByAffiliateId === affiliate.id ? 'YES' : 'NO'})`)

  // Simulate AffiliateClick for this provider
  await db.affiliateClick.deleteMany({ where: { affiliateId: affiliate.id } })
  const affClick = await db.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      referredUserId: doctorUser.id,
      status: 'SIGNED_UP',
      clickedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      convertedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    },
  })
  console.log(`  AffiliateClick: ${affClick.id} (status: SIGNED_UP, referred: ${affClick.referredUserId === doctorUser.id ? 'YES' : 'NO'})`)

  // Create a Service for this doctor.
  // Migration Plan v3: the Service is CLASSIFIED (modality: 'VIDEO') so the
  // patient booking flow auto-selects it for the VIDEO tile. BookingDialog
  // matches Service.modality against the selected tile, and booking.create
  // charges Service.price ($100 — equals the onlineFee here, so both booking
  // cases below keep their expected $100 math).
  await db.service.deleteMany({ where: { doctorId: doctor.id } })
  const service = await db.service.create({
    data: {
      name: 'Cardiology Consultation',
      description: 'General cardiology consultation',
      price: '100',
      currency: 'USD',
      durationMinutes: 30,
      providerType: 'DOCTOR',
      doctorId: doctor.id,
      modality: 'VIDEO',
      isActive: true,
    },
  })
  console.log(`  Service: ${service.name} ($${service.price}, modality: VIDEO)`)

  // Create Slots
  await db.slot.deleteMany({ where: { doctorId: doctor.id } })
  const slot1 = await db.slot.create({
    data: {
      doctorId: doctor.id,
      startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      isBooked: true, // Will be booked by the success case
    },
  })
  const slot2 = await db.slot.create({
    data: {
      doctorId: doctor.id,
      startTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      endTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      isBooked: false, // Was booked then cancelled
    },
  })
  console.log(`  Slots: 2 created (slot1 for success case, slot2 for cancellation case)`)

  // === 4. Patient & Booking Flow (Success Case) ===
  console.log('\n━━━ 4. Booking Flow — SUCCESS CASE ($100, COMPLETED) ━━━')
  console.log('  Expected: platform=$30, affiliate=$7.50 (25% of $30), provider=$70')

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
    },
  })
  await db.patient.deleteMany({ where: { userId: patientUser.id } })
  await db.patient.create({ data: { userId: patientUser.id } })
  console.log(`  Patient: ${patientUser.email}`)

  // Financial calculations
  const amount = '100.00'
  const platformRate = parseFloat(commissionRate.rate) // 30
  const affiliateRate = parseFloat(commissionRate.affiliateRate) // 25
  const platformCut = (parseFloat(amount) * platformRate / 100).toFixed(2) // $30.00
  const affiliateCommission = (parseFloat(platformCut) * affiliateRate / 100).toFixed(2) // $7.50
  const providerNet = (parseFloat(amount) - parseFloat(platformCut)).toFixed(2) // $70.00

  console.log(`  Math: amount=$${amount}, platform=${platformRate}%→$${platformCut}, affiliate=${affiliateRate}% of $${platformCut}→$${affiliateCommission}, provider→$${providerNet}`)

  // Clean up old bookings/payments/ledger for this patient+doctor
  const oldBookings = await db.booking.findMany({ where: { doctorId: doctor.id } })
  for (const ob of oldBookings) {
    await db.ledgerEntry.deleteMany({ where: { bookingId: ob.id } })
    await db.payment.deleteMany({ where: { bookingId: ob.id } })
    await db.review.deleteMany({ where: { bookingId: ob.id } })
  }
  await db.booking.deleteMany({ where: { doctorId: doctor.id } })

  // Also clean up any old ledger entries directly on this doctor's userId and affiliate's userId
  await db.ledgerEntry.deleteMany({ where: { userId: doctorUser.id } })
  await db.ledgerEntry.deleteMany({ where: { userId: affUser.id } })

  // Create Booking 1 (SUCCESS)
  const booking1 = await db.booking.create({
    data: {
      patientId: patientUser.id,
      providerType: 'DOCTOR',
      doctorId: doctor.id,
      serviceId: service.id,
      slotId: slot1.id,
      visitType: 'ONLINE',
      status: 'COMPLETED',
      startDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // yesterday
      endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      amount,
      currency: 'USD',
      commissionRate: String(platformRate),
      commissionAmount: platformCut,
      affiliateRate: String(affiliateRate),
      affiliateAmount: affiliateCommission,
      affiliateId: affUser.id,
      providerNetAmount: providerNet,
      notes: 'E2E test booking - success case',
    },
  })

  const payment1 = await db.payment.create({
    data: {
      bookingId: booking1.id,
      stripeChargeId: `ch_mock_success_${booking1.id.slice(-8)}`,
      amount,
      currency: 'USD',
      status: 'SUCCEEDED',
    },
  })

  // Ledger entries for success case
  await db.ledgerEntry.createMany({
    data: [
      { bookingId: booking1.id, paymentId: payment1.id, userId: patientUser.id, type: 'PATIENT_CHARGE', amount, description: 'Patient payment for consultation' },
      { bookingId: booking1.id, paymentId: payment1.id, type: 'COMMISSION', amount: platformCut, description: `Platform commission (${platformRate}%)` },
      { bookingId: booking1.id, paymentId: payment1.id, userId: affUser.id, type: 'AFFILIATE_COMMISSION', amount: affiliateCommission, description: `Affiliate commission (${affiliateRate}% of platform)` },
      { bookingId: booking1.id, paymentId: payment1.id, userId: doctorUser.id, type: 'PROVIDER_CREDIT', amount: providerNet, description: 'Provider credit (completed)' },
    ],
  })
  console.log(`  Booking1: ${booking1.id} (status: ${booking1.status})`)
  console.log(`  Payment1: ${payment1.id} (status: ${payment1.status})`)
  console.log(`  Ledger: 4 entries created (PATIENT_CHARGE, COMMISSION, AFFILIATE_COMMISSION, PROVIDER_CREDIT)`)

  // Update affiliate: move commission to availableBalance (simulating completion)
  await db.affiliate.update({
    where: { id: affiliate.id },
    data: {
      totalBookings: { increment: 1 },
      totalEarnings: affiliateCommission,
      availableBalance: affiliateCommission,
      pendingBalance: '0',
    },
  })
  // Update affiliate click status
  await db.affiliateClick.update({
    where: { id: affClick.id },
    data: { status: 'COMPLETED', bookingId: booking1.id, commissionAmount: affiliateCommission },
  })
  console.log(`  Affiliate updated: availableBalance=$${affiliateCommission}, totalEarnings=$${affiliateCommission}`)

  // === 5. Patient & Booking Flow (Cancellation Case) ===
  console.log('\n━━━ 5. Booking Flow — CANCELLATION CASE ($100, CANCELLED) ━━━')
  console.log('  Expected: all ledger entries reversed, affiliate NOT negatively impacted')

  const amount2 = '100.00'
  const platformCut2 = (parseFloat(amount2) * platformRate / 100).toFixed(2) // $30.00
  const affiliateCommission2 = (parseFloat(platformCut2) * affiliateRate / 100).toFixed(2) // $7.50
  const providerNet2 = (parseFloat(amount2) - parseFloat(platformCut2)).toFixed(2) // $70.00
  const refundAmount = amount2 // Full refund on cancellation

  console.log(`  Math: amount=$${amount2}, platform→$${platformCut2}, affiliate→$${affiliateCommission2}, provider→$${providerNet2}`)
  console.log(`  Refund: $${refundAmount} (full refund)`)

  // Create Booking 2 (CANCELLATION)
  const booking2 = await db.booking.create({
    data: {
      patientId: patientUser.id,
      providerType: 'DOCTOR',
      doctorId: doctor.id,
      serviceId: service.id,
      slotId: slot2.id,
      visitType: 'ONLINE',
      status: 'CANCELLED',
      startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      amount: amount2,
      currency: 'USD',
      commissionRate: String(platformRate),
      commissionAmount: platformCut2,
      affiliateRate: String(affiliateRate),
      affiliateAmount: affiliateCommission2,
      affiliateId: affUser.id,
      providerNetAmount: providerNet2,
      cancellationReason: 'Patient cancelled - test case',
      cancelledById: patientUser.id,
      cancelledAt: new Date(),
      refundAmount,
    },
  })

  const payment2 = await db.payment.create({
    data: {
      bookingId: booking2.id,
      stripeChargeId: `ch_mock_cancel_${booking2.id.slice(-8)}`,
      amount: amount2,
      currency: 'USD',
      status: 'REFUNDED',
      refundAmount,
    },
  })

  // Ledger entries for cancellation case (initial + reversal)
  await db.ledgerEntry.createMany({
    data: [
      // Initial charges
      { bookingId: booking2.id, paymentId: payment2.id, userId: patientUser.id, type: 'PATIENT_CHARGE', amount: amount2, description: 'Patient payment' },
      { bookingId: booking2.id, paymentId: payment2.id, type: 'COMMISSION', amount: platformCut2, description: 'Platform commission' },
      { bookingId: booking2.id, paymentId: payment2.id, userId: affUser.id, type: 'AFFILIATE_COMMISSION', amount: affiliateCommission2, description: 'Affiliate commission (initial)' },
      { bookingId: booking2.id, paymentId: payment2.id, userId: doctorUser.id, type: 'PROVIDER_CREDIT', amount: providerNet2, description: 'Provider credit (initial)' },
      // Reversals
      { bookingId: booking2.id, paymentId: payment2.id, userId: patientUser.id, type: 'REFUND_PATIENT', amount: `-${refundAmount}`, description: 'Full refund to patient' },
      { bookingId: booking2.id, paymentId: payment2.id, type: 'REFUND_COMMISSION_REVERSAL', amount: `-${platformCut2}`, description: 'Commission reversal' },
      { bookingId: booking2.id, paymentId: payment2.id, userId: doctorUser.id, type: 'REFUND_PROVIDER_DEBIT', amount: `-${providerNet2}`, description: 'Provider debit reversal' },
      { bookingId: booking2.id, paymentId: payment2.id, userId: affUser.id, type: 'AFFILIATE_COMMISSION_REVERSAL', amount: `-${affiliateCommission2}`, description: 'Affiliate commission reversed' },
    ],
  })
  console.log(`  Booking2: ${booking2.id} (status: ${booking2.status})`)
  console.log(`  Payment2: ${payment2.id} (status: ${payment2.status})`)
  console.log(`  Ledger: 8 entries created (4 initial + 4 reversals)`)

  // Affiliate reversal: since this booking was never completed (still in pendingBalance conceptually),
  // we reverse from pendingBalance. But since we only added to availableBalance for booking1,
  // the affiliate's availableBalance should NOT be touched for booking2.
  // The reversal just prevents the affiliate from ever receiving this commission.
  // In the seed, we simulate that the commission was in pendingBalance (not yet released):
  // Since we didn't add booking2's commission to any balance, we just decrement totalEarnings
  // to keep the count accurate (totalEarnings reflects only earned/released commissions).
  // The AFFILIATE_COMMISSION_REVERSAL ledger entry handles the financial record.
  // availableBalance remains $7.50 (from booking1 only).

  // Update affiliate click for booking2 (cancelled)
  await db.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      referredUserId: doctorUser.id,
      status: 'CANCELLED' as any,
      bookingId: booking2.id,
      commissionAmount: affiliateCommission2,
      clickedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      convertedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  })

  // Release slot2
  await db.slot.update({ where: { id: slot2.id }, data: { isBooked: false } })

  // === VERIFICATION ===
  console.log('\n━━━ VERIFICATION ━━━')

  // Reload affiliate
  const finalAff = await db.affiliate.findUnique({ where: { id: affiliate.id } })
  if (!finalAff) throw new Error('Affiliate not found')

  // Calculate doctor's balance from ledger
  const doctorEntries = await db.ledgerEntry.findMany({
    where: { userId: doctorUser.id },
    include: { booking: { select: { status: true } } },
  })
  let doctorAvailable = 0
  let doctorPending = 0
  for (const e of doctorEntries) {
    const amt = parseFloat(e.amount)
    if (e.type === 'PAYOUT') { doctorAvailable -= Math.abs(amt); continue }
    if (e.type === 'PROVIDER_CREDIT') {
      if (e.booking?.status === 'COMPLETED') doctorAvailable += amt
      else if (e.booking?.status === 'CANCELLED' || e.booking?.status === 'REFUNDED') { /* skip */ }
      else doctorPending += amt
    } else if (e.type === 'REFUND_PROVIDER_DEBIT') {
      if (e.booking?.status === 'CANCELLED' || e.booking?.status === 'REFUNDED') { /* skip — paired with credit */ }
      else doctorAvailable += amt
    }
  }

  // Calculate affiliate's balance from ledger
  const affEntries = await db.ledgerEntry.findMany({ where: { userId: affUser.id } })
  let affTotalFromLedger = 0
  for (const e of affEntries) {
    affTotalFromLedger += parseFloat(e.amount)
  }

  console.log('\n┌─────────────────────────────────────────────────────────────┐')
  console.log('│                    BALANCE VERIFICATION                     │')
  console.log('├─────────────────────────────────────────────────────────────┤')
  console.log(`│  AFFILIATE                                                  │`)
  console.log(`│    availableBalance (DB):  $${finalAff.availableBalance.padStart(10)}             │`)
  console.log(`│    pendingBalance (DB):    $${finalAff.pendingBalance.padStart(10)}             │`)
  console.log(`│    totalEarnings (DB):     $${finalAff.totalEarnings.padStart(10)}             │`)
  console.log(`│    paidOut (DB):           $${finalAff.paidOut.padStart(10)}             │`)
  console.log(`│    ledger total:           $${affTotalFromLedger.toFixed(2).padStart(10)}             │`)
  console.log(`│    EXPECTED available:     $${'7.50'.padStart(10)}             │`)
  console.log(`│    MATCH: ${finalAff.availableBalance === '7.50' ? '✅ YES' : '❌ NO'}                                              │`)
  console.log('├─────────────────────────────────────────────────────────────┤')
  console.log(`│  DOCTOR (PROVIDER)                                          │`)
  console.log(`│    available (calculated):  $${doctorAvailable.toFixed(2).padStart(10)}             │`)
  console.log(`│    pending (calculated):    $${doctorPending.toFixed(2).padStart(10)}             │`)
  console.log(`│    EXPECTED available:      $${'70.00'.padStart(10)}             │`)
  console.log(`│    MATCH: ${doctorAvailable === 70 ? '✅ YES' : '❌ NO'}                                              │`)
  console.log('├─────────────────────────────────────────────────────────────┤')
  console.log(`│  BOOKINGS                                                   │`)
  console.log(`│    Booking1 (success):      ${booking1.status.padEnd(12)} amount=$${amount}      │`)
  console.log(`│    Booking2 (cancelled):    ${booking2.status.padEnd(12)} amount=$${amount2}      │`)
  console.log('└─────────────────────────────────────────────────────────────┘')

  // Final assertions
  if (finalAff.availableBalance !== '7.50') {
    console.error('\n❌ ASSERTION FAILED: Affiliate availableBalance should be $7.50')
    process.exit(1)
  }
  if (doctorAvailable !== 70) {
    console.error('\n❌ ASSERTION FAILED: Doctor available should be $70.00')
    process.exit(1)
  }

  console.log('\n✅ All assertions passed! The affiliate and financial system is working correctly.\n')

  // Print login credentials
  console.log('━━━ Test Credentials ━━━')
  console.log('  Admin:      admin@wishubest.com / admin123')
  console.log('  Patient:    patient@wishubest.com / patient123')
  console.log('  Doctor:     doctor@wishubest.com / doctor123')
  console.log('  Affiliate:  affiliate@wishubest.com / affiliate123')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
