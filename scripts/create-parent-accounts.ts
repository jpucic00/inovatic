/**
 * create-parent-accounts.ts — give every existing child the one parent login
 * that will see it in the portal (owner decision 2026-09-29: one account per
 * parent e-mail, children picked after login).
 *
 *   npm run db:create-parent-accounts            # dry run, prints the report
 *   npm run db:create-parent-accounts -- --apply
 *
 * WHAT IT DOES. Groups every non-deleted child by its parent's e-mail
 * (`normalizeParentEmail` — the same key the e-mail campaigns merge on), then
 * per address either links the children to the account that already has it
 * (a parent account, or a teacher/admin whose e-mail the parent used) or
 * creates a PARENT account for it. New accounts get an unusable password:
 * nobody can sign in until the family is sent a setup link.
 *
 * WHAT IT NEVER DOES. It never moves a child that already has a parent account
 * — a link an admin confirmed is not a batch's to undo — so a re-run is a
 * no-op. It never guesses: a child with no usable address, or an address owned
 * by a child/classroom/deleted login, is reported and left without access.
 *
 * WHY A SCRIPT AND NOT A MIGRATION. It decides which children count as one
 * family, which deserves a look before it lands. Dry run first, read the
 * report, then `--apply`.
 *
 * HOW IT IS RUN AGAINST PRODUCTION. Locally, with Railway injecting the
 * service's variables (the production image ships neither `scripts/` nor
 * `tsx`):
 *
 *   railway run npm run db:create-parent-accounts
 *   railway run npm run db:create-parent-accounts -- --apply
 *
 * See docs/runbooks/create-parent-accounts.md.
 */
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { db } from '../src/lib/db'
import { unusablePasswordHash } from '../src/lib/password'
import { planParentBackfill, type BackfillFamily } from '../src/lib/parent-account-backfill'

const apply = process.argv.includes('--apply')

function section(title: string, lines: string[]): void {
  if (lines.length === 0) return
  console.log(`\n  ${title} (${lines.length}):`)
  for (const line of lines) console.log(`    - ${line}`)
}

async function applyFamily(family: BackfillFamily): Promise<number> {
  // Hashed before the transaction opens: bcrypt at cost 12 is ~200 ms, and it
  // has no business holding a transaction open.
  const passwordHash = family.accountId ? null : await unusablePasswordHash()
  return db.$transaction(async (tx) => {
    let accountId = family.accountId
    if (!accountId) {
      const created = await tx.user.create({
        data: {
          email: family.email,
          passwordHash: passwordHash as string,
          firstName: family.firstName,
          lastName: family.lastName,
          role: 'PARENT',
          city: family.city,
        },
        select: { id: true },
      })
      accountId = created.id
    }
    // `parentAccountId: null` repeated on the write: a child an admin linked
    // while this ran keeps the admin's link.
    const { count } = await tx.user.updateMany({
      where: { id: { in: family.childIds }, role: 'STUDENT', parentAccountId: null },
      data: { parentAccountId: accountId },
    })
    return count
  })
}

async function main(): Promise<void> {
  const [students, accounts] = await Promise.all([
    db.user.findMany({
      where: { role: 'STUDENT', deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        parentName: true,
        parentEmail: true,
        parentAccountId: true,
        city: true,
        createdAt: true,
      },
    }),
    db.user.findMany({
      where: { role: { not: 'STUDENT' } },
      select: { id: true, email: true, role: true, deletedAt: true },
    }),
  ])

  const plan = planParentBackfill(students, accounts)
  const newAccounts = plan.families.filter((f) => !f.accountId)
  const staff = plan.families.filter((f) => f.accountRole === 'ADMIN' || f.accountRole === 'TEACHER')
  const multiCity = plan.families.filter((f) => f.cities.length > 1)
  const toLink = plan.families.reduce((n, f) => n + f.childIds.length, 0)

  console.log(`\n  Parent accounts${apply ? '' : ' (DRY RUN)'}\n`)
  console.log(`  Children scanned                 ${students.length}`)
  console.log(`  Already linked (left alone)      ${plan.alreadyLinked}`)
  console.log(`  Children to link                 ${toLink}`)
  console.log(`  Families                         ${plan.families.length}`)
  console.log(`    new PARENT accounts            ${newAccounts.length}`)
  console.log(`    existing accounts              ${plan.families.length - newAccounts.length}`)
  console.log(`  Linked children without DOB      ${plan.withoutDob}`)

  section(
    'NO USABLE E-MAIL — no portal access until an admin adds one',
    plan.noEmail.map((c) => `${c.name}${c.raw ? ` (upisano: "${c.raw}")` : ''}`),
  )
  section(
    'REFUSED — address belongs to a login that cannot be a parent',
    plan.refused.map((r) => `${r.email} [${r.reason}]: ${r.childNames.join(', ')}`),
  )
  section(
    'STAFF ADDRESS — children open from this teacher/admin login',
    staff.map((f) => `${f.email}: ${f.childNames.join(', ')}`),
  )
  section(
    'CHILDREN IN BOTH CITIES — one login sees all of them',
    multiCity.map((f) => `${f.email}: ${f.childNames.join(', ')}`),
  )
  section(
    'ADDRESS CLEANED UP — read out of a paste or re-cased',
    plan.cleaned.map((c) => `${c.name}: "${c.raw}" → ${c.email}`),
  )
  section(
    'SIBLINGS — one login, several children',
    plan.families.filter((f) => f.childIds.length > 1).map((f) => `${f.email}: ${f.childNames.join(', ')}`),
  )

  if (!apply) {
    console.log('\n  Dry run — nothing written. Re-run with --apply to save.\n')
    return
  }

  let linked = 0
  for (const [i, family] of plan.families.entries()) {
    linked += await applyFamily(family)
    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${plan.families.length}`)
  }
  console.log(`\n  ${linked} child(ren) linked. Done.\n`)
}

main()
  .catch((err: unknown) => {
    console.error('create-parent-accounts failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
