/**
 * Seed default KYC requirements for each provider type.
 *
 * Usage: bun run scripts/seed-kyc-requirements.ts
 *
 * Uses upsert-like logic (findOrCreate) so it can be run multiple times
 * without creating duplicates. If a requirement with the same
 * providerType + documentName already exists, it is skipped.
 */
import { db } from '../src/lib/db'

type SeedReq = {
  providerType: string
  documentName: string
  description: string
  isRequired: boolean
  order: number
}

const SEED_REQUIREMENTS: SeedReq[] = [
  // DOCTOR
  { providerType: 'DOCTOR', documentName: 'Medical License', description: 'Valid medical license issued by the relevant health authority', isRequired: true, order: 1 },
  { providerType: 'DOCTOR', documentName: 'ID Card / Passport', description: 'Government-issued identification', isRequired: true, order: 2 },
  { providerType: 'DOCTOR', documentName: 'Profile Photo', description: 'Professional headshot for your public profile', isRequired: true, order: 3 },

  // HOSPITAL
  { providerType: 'HOSPITAL', documentName: 'Hospital License', description: 'Official hospital operating license', isRequired: true, order: 1 },
  { providerType: 'HOSPITAL', documentName: 'Tax Certificate', description: 'Tax registration certificate', isRequired: true, order: 2 },

  // HOTEL
  { providerType: 'HOTEL', documentName: 'Business License', description: 'Valid business operation license', isRequired: true, order: 1 },
  { providerType: 'HOTEL', documentName: 'Tourism Certificate', description: 'Tourism board certification or rating', isRequired: true, order: 2 },

  // TRANSLATOR
  { providerType: 'TRANSLATOR', documentName: 'Translation Certification', description: 'Certification from a recognized translation body', isRequired: true, order: 1 },
  { providerType: 'TRANSLATOR', documentName: 'No Criminal Record Certificate', description: 'Recent criminal background check (within 6 months)', isRequired: true, order: 2 },
]

async function main() {
  console.log('🌱 Seeding KYC requirements…')

  let created = 0
  let skipped = 0

  for (const req of SEED_REQUIREMENTS) {
    // Check if a requirement with the same providerType + documentName already exists
    const existing = await db.kycRequirement.findFirst({
      where: {
        providerType: req.providerType,
        documentName: req.documentName,
      },
    })

    if (existing) {
      console.log(`  ⏭  Skipped (exists): ${req.providerType} → ${req.documentName}`)
      skipped++
      continue
    }

    await db.kycRequirement.create({ data: req })
    console.log(`  ✅ Created: ${req.providerType} → ${req.documentName} (order ${req.order})`)
    created++
  }

  console.log(`\n✅ Done. Created ${created}, skipped ${skipped} (already existed).`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
