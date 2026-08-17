/**
 * Seed default KYC requirements for each provider type.
 *
 * Usage: bun run scripts/seed-kyc-requirements.ts
 *
 * Uses upsert-like logic (findOrCreate) so it can be run multiple times
 * without creating duplicates. If a requirement with the same
 * providerType + documentName already exists, it is skipped.
 *
 * NOTE: Existing seeded rows created before the KycRequirementType enum
 * migration will default to IMAGE. To upgrade them in-place, run the
 * `upgradeExisting: true` branch (see bottom of this file).
 */
import { db } from '../src/lib/db'

type SeedReq = {
  providerType: string
  documentName: string
  description: string
  isRequired: boolean
  order: number
  type: 'IMAGE' | 'DOCUMENT' | 'VIDEO'
}

const SEED_REQUIREMENTS: SeedReq[] = [
  // DOCTOR
  { providerType: 'DOCTOR', documentName: 'Medical License', description: 'Valid medical license issued by the relevant health authority', isRequired: true, order: 1, type: 'IMAGE' },
  { providerType: 'DOCTOR', documentName: 'ID Card / Passport', description: 'Government-issued identification', isRequired: true, order: 2, type: 'IMAGE' },
  { providerType: 'DOCTOR', documentName: 'Profile Photo', description: 'Professional headshot for your public profile', isRequired: true, order: 3, type: 'IMAGE' },
  { providerType: 'DOCTOR', documentName: 'Liveness Self-Verification', description: 'Record a 5-second selfie video. Your face and ID must be clearly visible. Used for anti-fraud identity verification.', isRequired: true, order: 4, type: 'VIDEO' },

  // HOSPITAL
  { providerType: 'HOSPITAL', documentName: 'Hospital License', description: 'Official hospital operating license', isRequired: true, order: 1, type: 'IMAGE' },
  { providerType: 'HOSPITAL', documentName: 'Tax Certificate', description: 'Tax registration certificate (PDF)', isRequired: true, order: 2, type: 'DOCUMENT' },
  { providerType: 'HOSPITAL', documentName: 'Liveness Self-Verification', description: 'Record a 5-second selfie video from an authorised hospital representative.', isRequired: true, order: 3, type: 'VIDEO' },

  // HOTEL
  { providerType: 'HOTEL', documentName: 'Business License', description: 'Valid business operation license', isRequired: true, order: 1, type: 'IMAGE' },
  { providerType: 'HOTEL', documentName: 'Tourism Certificate', description: 'Tourism board certification or rating (PDF)', isRequired: true, order: 2, type: 'DOCUMENT' },
  { providerType: 'HOTEL', documentName: 'Liveness Self-Verification', description: 'Record a 5-second selfie video from an authorised hotel representative.', isRequired: true, order: 3, type: 'VIDEO' },

  // TRANSLATOR
  { providerType: 'TRANSLATOR', documentName: 'Translation Certification', description: 'Certification from a recognized translation body', isRequired: true, order: 1, type: 'IMAGE' },
  { providerType: 'TRANSLATOR', documentName: 'No Criminal Record Certificate', description: 'Recent criminal background check (within 6 months). PDF.', isRequired: true, order: 2, type: 'DOCUMENT' },
  { providerType: 'TRANSLATOR', documentName: 'Liveness Self-Verification', description: 'Record a 5-second selfie video. Your face and ID must be clearly visible.', isRequired: true, order: 3, type: 'VIDEO' },
]

async function main() {
  console.log('🌱 Seeding KYC requirements…')

  let created = 0
  let skipped = 0
  let upgraded = 0

  for (const req of SEED_REQUIREMENTS) {
    // Check if a requirement with the same providerType + documentName already exists
    const existing = await db.kycRequirement.findFirst({
      where: {
        providerType: req.providerType,
        documentName: req.documentName,
      },
    })

    if (existing) {
      // Backfill the `type` field on rows seeded before the enum migration.
      // Prisma `type` defaulted to IMAGE on legacy rows; if the seed says
      // otherwise, upgrade in-place so admins see the correct type.
      if (existing.type !== req.type) {
        await db.kycRequirement.update({
          where: { id: existing.id },
          data: { type: req.type },
        })
        console.log(`  ⬆  Upgraded type: ${req.providerType} → ${req.documentName} (${existing.type} → ${req.type})`)
        upgraded++
      } else {
        console.log(`  ⏭  Skipped (exists): ${req.providerType} → ${req.documentName}`)
      }
      skipped++
      continue
    }

    await db.kycRequirement.create({ data: req })
    console.log(`  ✅ Created: ${req.providerType} → ${req.documentName} (order ${req.order}, type ${req.type})`)
    created++
  }

  console.log(`\n✅ Done. Created ${created}, skipped ${skipped} (already existed), upgraded ${upgraded} (type backfilled).`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
