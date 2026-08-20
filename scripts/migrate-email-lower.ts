// Official migration script: backfill User.emailLower with lower(email).
// Run once via `npx tsx scripts/migrate-email-lower.ts` after `prisma db push`.
// This is the project's standard migration tool (prisma db push + backfill script),
// per the worklog convention — no direct SQL manipulation.
import { db } from '../src/lib/db'

async function main() {
  console.log('📧 Backfilling emailLower …')

  const users = await db.user.findMany({ select: { id: true, email: true, emailLower: true } })
  let updated = 0
  let skipped = 0

  for (const u of users) {
    const lower = u.email.toLowerCase()
    if (u.emailLower === lower) {
      skipped++
      continue
    }
    await db.user.update({
      where: { id: u.id },
      data: { emailLower: lower },
    })
    updated++
  }

  // Detect any case-collisions that would violate the new unique index
  const dupes = await db.$queryRaw<{ emailLower: string; n: bigint }[]>`
    SELECT "emailLower", COUNT(*) AS n FROM "User" GROUP BY "emailLower" HAVING COUNT(*) > 1
  `
  if (dupes.length > 0) {
    console.error('❌ Case-collision detected — emails differing only by case exist:')
    for (const d of dupes) console.error(`   - ${d.emailLower} (${d.n} rows)`)
    console.error('Fix the duplicates manually before applying the unique index.')
    process.exit(1)
  }

  console.log(`✅ Done. Updated: ${updated}, already correct: ${skipped}. Unique index is safe to apply.`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})