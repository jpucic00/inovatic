/**
 * A fail-fast check for the one dev-database condition that makes a large part
 * of the suite red for reasons that have nothing to do with the code.
 *
 * Standard groups are offered publicly only while BOTH hold for the current
 * school year: the group's module arc still has a future enrolling module, and
 * its course has an open `CourseEnrollmentWindow`. Both are dated, so both rot
 * as real time passes — and when they do, `getActivePrograms` correctly returns
 * nothing, `#scheduledGroupId` never renders, and every spec that signs a child
 * up fails on a missing dropdown. That reads like a broken form, which is how it
 * has been mis-diagnosed before.
 *
 * `npm run db:refresh-dev-dates -- --apply` fixes it in seconds. The problem was
 * never the fix, it was that nothing said the fix was needed — so this runs
 * before the suite, is strictly READ-ONLY, and turns a scattered set of
 * assertion failures into one sentence naming the command.
 *
 * A second, quieter rot (found 2026-09-02): the public feed keys on the
 * ENROLLMENT WINDOW's year, so on 1 September it can still offer last year's
 * plan while `computeSchoolYear()` — and with it the admin sidebar — has moved
 * on. The create-student dialog then lists no modules for the new year,
 * "Svi moduli" checks nothing, and `createStudentInGroup` dies in `beforeAll`
 * with the dialog still open and no error text. The first check cannot see
 * that, so a second one asks the question directly: does the CURRENT school
 * year have any standard module plan in SPLIT at all?
 *
 * Deliberately NOT auto-applying it. This runs against the dev database, and a
 * setup hook that silently rewrites every module window (and with it every
 * expected session and attendance screen) because a test run started is a much
 * bigger thing than a red spec.
 */
import { db } from '@/lib/db'
import { getActivePrograms } from '@/actions/public/programs'
import { hasDatedModules } from '@/lib/program-kind'
import { computeSchoolYear } from '@/lib/school-year'

const REFRESH_HINT = [
  '',
  '         npm run db:refresh-dev-dates -- --apply',
  '',
  '     (Dry-runs by default; refuses a non-local DATABASE_URL without --force;',
  '      upserts ModuleSchedule + CourseEnrollmentWindow and deletes nothing.)',
  '',
]

/** The 1 September case: the sidebar year has no standard module plan yet. */
async function warnIfCurrentYearUnplanned(): Promise<void> {
  const year = computeSchoolYear()
  const planned = await db.moduleSchedule.count({
    where: { schoolYear: year, city: 'SPLIT', module: { course: { kind: 'STANDARD' } } },
  })
  if (planned > 0) return

  console.warn(
    [
      '',
      `  ⚠  No standard module plan exists for ${year} in SPLIT — the school year`,
      '     has flipped and the dev plans still carry the previous label.',
      '',
      '     The admin sidebar now defaults to this year, so the create-student',
      '     dialog lists no modules, "Svi moduli" checks nothing, and every spec',
      '     that enrols a child through the admin (createStudentInGroup) dies in',
      '     beforeAll with the dialog still open. Fix it with:',
      ...REFRESH_HINT,
    ].join('\n'),
  )
}

export default async function globalSetup(): Promise<void> {
  try {
    await warnIfCurrentYearUnplanned()

    const programs = await getActivePrograms('SPLIT')
    const standardWithGroups = programs.filter(
      (p) => hasDatedModules(p.kind) && p.groups.length > 0,
    )
    if (standardWithGroups.length > 0) return

    // Distinguish "nobody ever planned this dev database" from "it rotted",
    // because the second one is the common case and has a one-line fix.
    const anyStandardGroup = await db.scheduledGroup.count({
      where: { city: 'SPLIT', course: { kind: 'STANDARD' } },
    })

    console.warn(
      [
        '',
        '  ⚠  No standard program is publicly offered in SPLIT right now.',
        anyStandardGroup > 0
          ? `     ${anyStandardGroup} standard group(s) exist, so this is date rot: their module`
          : '     No standard groups exist at all, so this database was never planned:',
        anyStandardGroup > 0
          ? '     arc and/or enrollment window has moved into the past.'
          : '     there is nothing for the public feed to offer.',
        '',
        '     Every spec that signs a child up through /prijava will fail on a',
        '     missing termin dropdown. Fix it with:',
        ...REFRESH_HINT,
      ].join('\n'),
    )
  } catch (err) {
    // Never block a run on this. It is a diagnostic, and a diagnostic that can
    // fail the suite is worse than the confusion it exists to remove.
    console.warn('globalSetup: dev-data check skipped:', err)
  } finally {
    await db.$disconnect()
  }
}
