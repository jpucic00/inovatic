/**
 * The 2026-09-06 data migration replayed against rows that need it.
 *
 * `npm run test:integration` deploys every migration onto an EMPTY database,
 * so the three UPDATEs in `20260906120000_trim_student_names` never touch a
 * row in the ordinary run. Replaying the file here is the only place its
 * actual effect — and its two guarantees, STUDENT-only and idempotent — are
 * exercised before it reaches production.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { createStudent, createTeacher } from './helpers/factory'

const MIGRATION = readFileSync(
  'prisma/migrations/20260906120000_trim_student_names/migration.sql',
  'utf8',
)

// Comments first, then statements: the header prose carries a semicolon.
const statements = MIGRATION.replace(/^\s*--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

async function replay(): Promise<number> {
  let affected = 0
  for (const statement of statements) affected += await db.$executeRawUnsafe(statement)
  return affected
}

describe('20260906120000_trim_student_names', () => {
  it('trims, single-spaces and composes student names, trims the parent e-mail, and leaves staff alone', async () => {
    const tag = Date.now().toString(36)
    // Written straight through Prisma, bypassing the normalizing action path.
    const student = await createStudent({
      firstName: '  Ana   Marija ',
      lastName: `Anić${tag} `, // NFD: c + combining acute
      parentEmail: `  mama-${tag}@test.hr  `,
    })
    const teacher = await createTeacher({ firstName: '  Pero ', lastName: `Peric${tag}  ` })

    const first = await replay()
    expect(first).toBeGreaterThanOrEqual(3)

    const fixed = await db.user.findUniqueOrThrow({ where: { id: student.id } })
    expect(fixed.firstName).toBe('Ana Marija')
    expect(fixed.lastName).toBe(`Anić${tag}`)
    expect(fixed.lastName).toBe(fixed.lastName.normalize('NFC'))
    expect(fixed.parentEmail).toBe(`mama-${tag}@test.hr`)

    // Not a STUDENT: the migration must not have an opinion about staff rows.
    const staff = await db.user.findUniqueOrThrow({ where: { id: teacher.id } })
    expect(staff.firstName).toBe('  Pero ')
    expect(staff.lastName).toBe(`Peric${tag}  `)

    // Idempotent: a second run finds nothing left to change on these rows.
    await replay()
    const again = await db.user.findUniqueOrThrow({ where: { id: student.id } })
    expect(again).toEqual(fixed)
  })
})
