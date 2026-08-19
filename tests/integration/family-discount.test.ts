/**
 * The sibling-discount marker on a student profile, against the real database.
 *
 * The rule it encodes reads simply — "another child of the same parent, enrolled
 * this year" — but every arm of it was a deliberate decision, and each one is
 * pinned here so a later simplification has to argue with a failing test:
 *
 *  - a DIFFERENT child, not a second enrollment: one kid in both an SLR program
 *    and the natjecateljski one does not discount themselves
 *  - a sibling in the natjecateljski program DOES unlock the SLR discount
 *  - a sibling in a radionica does NOT — workshops run their own 20 € popust
 *  - the note belongs to a school year, so a sibling in another year is nobody
 *  - same city only, and never a soft-deleted account
 *  - the `contains` prefilter the query needs (for imported "Ime <a@b>" addresses)
 *    must not be what decides the match
 */
import { describe, expect, it } from 'vitest'
import { findFamilyDiscounts } from '@/lib/family-discount'
import { computeSchoolYear, getPreviousSchoolYear } from '@/lib/school-year'
import {
  createCourse,
  createEnrollment,
  createGroup,
  createStudent,
} from './helpers/factory'
import type { ProgramKind } from '@prisma/client'

const CY = computeSchoolYear()
const PY = getPreviousSchoolYear(CY)

/** A child with an enrollment of the given kind, in the given year and city. */
async function enrolledChild(opts: {
  parentEmail: string | null
  kind?: ProgramKind
  schoolYear?: string
  city?: 'SPLIT' | 'SIBENIK'
  deleted?: boolean
  title?: string
}) {
  const city = opts.city ?? 'SPLIT'
  const schoolYear = opts.schoolYear ?? CY
  const student = await createStudent({
    city,
    parentEmail: opts.parentEmail,
    deletedAt: opts.deleted ? new Date() : null,
  })
  const course = await createCourse({
    kind: opts.kind ?? 'STANDARD',
    title: opts.title,
    // Radionice are per-city courses; the shared ladder keeps city null.
    city: (opts.kind ?? 'STANDARD') === 'RADIONICA' ? city : null,
  })
  const group = await createGroup({ courseId: course.id, city, schoolYear })
  await createEnrollment(student.id, group.id, { schoolYear })
  return { student, course, group }
}

describe('findFamilyDiscounts', () => {
  it('flags both children when two siblings are in SLR programs', async () => {
    // The discount belongs to the family, so it shows on both profiles — an
    // admin looking at either child must see it.
    const email = `obitelj-${Date.now()}-a@test.local`
    const a = await enrolledChild({ parentEmail: email })
    const b = await enrolledChild({ parentEmail: email, title: 'SLR 3' })

    const forA = await findFamilyDiscounts(a.student.id, 'SPLIT')
    const forB = await findFamilyDiscounts(b.student.id, 'SPLIT')

    expect(forA[CY]?.map((s) => s.id)).toEqual([b.student.id])
    expect(forB[CY]?.map((s) => s.id)).toEqual([a.student.id])
  })

  it('lets a natjecateljski sibling unlock the SLR discount', async () => {
    const email = `obitelj-${Date.now()}-b@test.local`
    const slr = await enrolledChild({ parentEmail: email })
    const comp = await enrolledChild({
      parentEmail: email,
      kind: 'COMPETITION',
      title: 'Natjecateljski program',
    })

    const forSlr = await findFamilyDiscounts(slr.student.id, 'SPLIT')

    expect(forSlr[CY]?.map((s) => s.id)).toEqual([comp.student.id])
    expect(forSlr[CY][0].programTitles).toEqual(['Natjecateljski program'])
  })

  it('gives the natjecateljski child nothing of their own', async () => {
    // Only SLR cards carry the note, and this child has no SLR enrollment at
    // all — so there is no year to key one on. Their card is untouched, which is
    // the whole "do not touch natjecanja payments" requirement.
    const email = `obitelj-${Date.now()}-c@test.local`
    await enrolledChild({ parentEmail: email })
    const comp = await enrolledChild({ parentEmail: email, kind: 'COMPETITION' })

    expect(await findFamilyDiscounts(comp.student.id, 'SPLIT')).toEqual({})
  })

  it('does not discount one child who is in two programs', async () => {
    // The rule is a second CHILD, not a second sign-up.
    const email = `obitelj-${Date.now()}-d@test.local`
    const { student } = await enrolledChild({ parentEmail: email })
    const comp = await createCourse({ kind: 'COMPETITION' })
    const compGroup = await createGroup({ courseId: comp.id, city: 'SPLIT', schoolYear: CY })
    await createEnrollment(student.id, compGroup.id, { schoolYear: CY })

    expect(await findFamilyDiscounts(student.id, 'SPLIT')).toEqual({})
  })

  it('does not let a radionica-only sibling unlock it', async () => {
    // Workshops carry their own family discount (the flat 20 € "drugo dijete" in
    // radionica-deposit.ts). Counting one here would stack two schemes on one
    // family. Flip this test if the association decides otherwise — it is the
    // single predicate QUALIFYING_SIBLING_KINDS.
    const email = `obitelj-${Date.now()}-e@test.local`
    const slr = await enrolledChild({ parentEmail: email })
    await enrolledChild({ parentEmail: email, kind: 'RADIONICA' })

    expect(await findFamilyDiscounts(slr.student.id, 'SPLIT')).toEqual({})
  })

  it('ignores a sibling enrolled only in another school year', async () => {
    const email = `obitelj-${Date.now()}-f@test.local`
    const slr = await enrolledChild({ parentEmail: email })
    await enrolledChild({ parentEmail: email, schoolYear: PY })

    expect(await findFamilyDiscounts(slr.student.id, 'SPLIT')).toEqual({})
  })

  it('never crosses the city boundary', async () => {
    // Split and Šibenik are separate organizations with separate finances, and
    // the admin cannot open the other city's child anyway.
    const email = `obitelj-${Date.now()}-g@test.local`
    const split = await enrolledChild({ parentEmail: email, city: 'SPLIT' })
    await enrolledChild({ parentEmail: email, city: 'SIBENIK' })

    expect(await findFamilyDiscounts(split.student.id, 'SPLIT')).toEqual({})
  })

  it('ignores a soft-deleted sibling', async () => {
    const email = `obitelj-${Date.now()}-h@test.local`
    const slr = await enrolledChild({ parentEmail: email })
    await enrolledChild({ parentEmail: email, deleted: true })

    expect(await findFamilyDiscounts(slr.student.id, 'SPLIT')).toEqual({})
  })

  it('does not merge two families whose addresses overlap as substrings', async () => {
    // The query narrows with `contains` — it has to, because imported accounts
    // hold "Ime Prezime <a@b.hr>" — and `contains 'na@x'` matches 'ana@x'. The
    // in-memory exact re-match is what keeps these two families apart.
    const stamp = Date.now()
    const shortEmail = `na-${stamp}@test.local`
    const longEmail = `a${shortEmail}`
    const a = await enrolledChild({ parentEmail: shortEmail })
    await enrolledChild({ parentEmail: longEmail })

    expect(await findFamilyDiscounts(a.student.id, 'SPLIT')).toEqual({})
  })

  it('matches an imported "Ime Prezime <a@b>" address against the plain one', async () => {
    const email = `obitelj-${Date.now()}-i@test.local`
    const plain = await enrolledChild({ parentEmail: email })
    const imported = await enrolledChild({ parentEmail: `Ivana Ivić <${email}>` })

    const result = await findFamilyDiscounts(plain.student.id, 'SPLIT')

    expect(result[CY]?.map((s) => s.id)).toEqual([imported.student.id])
  })

  it('finds nobody for a child with no parent e-mail on file', async () => {
    const solo = await enrolledChild({ parentEmail: null })

    expect(await findFamilyDiscounts(solo.student.id, 'SPLIT')).toEqual({})
  })
})
