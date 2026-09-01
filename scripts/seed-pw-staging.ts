/**
 * STAGING-ONLY fixture: reset the seed patient's password so the e2e browser
 * DOM check (dashboard sidebar / Browse tabs) can sign in. Never points at
 * production — run via the wrapper script which exports the staging
 * DATABASE_URL, or from this clone whose .env targets wiyobe_staging.
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'

async function main() {
  const db = new PrismaClient()
  const email = 'patient@wishubest.com'
  const user = await db.user.update({
    where: { email },
    data: { passwordHash: hashPassword('patient123'), status: 'ACTIVE' },
  })
  console.log(`staging: ${user.email} (${user.role}) password reset to seed value`)
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
