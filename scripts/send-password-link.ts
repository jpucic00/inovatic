/**
 * send-password-link.ts — mail one account a password link from the command
 * line.
 *
 *   npm run auth:send-password-link -- <email>          # dry run: who, what
 *   npm run auth:send-password-link -- <email> --send
 *
 * WHY IT EXISTS. The app sends links from a profile page: a child's page for
 * the parent account, a teacher's page for staff. An administrator who does not
 * teach has neither, so when one loses their password — or missed the one-time
 * rollout mail — this is the way to reach them. It works for any account that
 * can have a link (parent, teacher, admin).
 *
 * WHAT IT SENDS. A SETUP link (7 days) while the account has never chosen its
 * own password, a RESET link (48 hours) once it has — the same rule as the
 * profile buttons. The link goes to the account's own e-mail, from its city's
 * office, and expires any link sent before it. The current password keeps
 * working until the new one is set.
 *
 * HOW IT IS RUN AGAINST PRODUCTION. Locally, with Railway injecting the
 * service's variables (the production image ships neither `scripts/` nor
 * `tsx`):
 *
 *   railway run npm run auth:send-password-link -- ime.prezime@example.com --send
 */
import * as dotenv from 'dotenv'
import { Prisma } from '@prisma/client'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { db } from '../src/lib/db'
import { sendPasswordLinkToAccount } from '../src/lib/password-link-send'
import { isLinkableRole } from '../src/lib/password-token'

async function main(): Promise<number> {
  const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'))?.trim()
  const send = process.argv.includes('--send')
  if (!email) {
    console.error('Usage: npm run auth:send-password-link -- <email> [--send]')
    return 2
  }

  const account = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, role: true, city: true, deletedAt: true, passwordSetAt: true },
  })
  if (!account || account.deletedAt) {
    console.error(`No active account with the e-mail ${email}.`)
    return 1
  }
  if (!isLinkableRole(account.role)) {
    console.error(`${account.email} is a ${account.role} account — only parents and staff get links.`)
    return 1
  }

  const purpose = account.passwordSetAt ? 'RESET' : 'SETUP'
  const audience = account.role === 'PARENT' ? 'PARENT' : 'STAFF'
  console.log(`  Account:  ${account.email} (${account.role}, ${account.city})`)
  console.log(`  Link:     ${purpose} (${account.passwordSetAt ? 'has chosen a password' : 'never chose a password'})`)

  if (!send) {
    console.log('\n  Dry run — nothing sent. Add --send to mail the link.')
    return 0
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('\n  RESEND_API_KEY is not set — nothing can be sent from this environment.')
    return 1
  }

  const res = await sendPasswordLinkToAccount({
    accountId: account.id,
    purpose,
    createdById: null,
    city: account.city,
    audience,
  })
  if (!res.ok) {
    console.error(`\n  ${res.error}`)
    return 1
  }
  console.log(`\n  Sent to ${res.email}.`)
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    // P2022 = a column this code expects is missing: the database has not run
    // the password-link migrations yet, i.e. the release is not deployed there.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2022') {
      console.error(
        '  This database does not have the password-link migrations yet. Deploy the release that adds them first, then run this again.',
      )
    } else {
      console.error(err)
    }
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
