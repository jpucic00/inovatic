/**
 * refresh-dev-dates.ts — re-anchor the dev database's module windows on today.
 *
 *   npm run db:refresh-dev-dates            # dry run, prints what would change
 *   npm run db:refresh-dev-dates -- --apply
 *
 * WHY THIS EXISTS. A standard group is publicly visible only while its arc
 * still has a module whose first session is ahead (`getGroupModuleArc` →
 * `toActiveGroup`). The dev database's windows were stamped once by the admin
 * planner, so real time eventually walks past the last module's start and every
 * standard group drops out of `/prijava` — `#scheduledGroupId` stops rendering
 * and phase2 specs 16/18 fail on a suite that has not changed. It last rotted
 * on 2026-08-16 and had been hand-patched with SQL before that.
 *
 * WHAT IT DOES. Re-plans the current school year from a kickoff a couple of
 * weeks back, so Modul 1 is mid-flight and three modules are still ahead — the
 * ordinary "year in progress" state, with months of runway before it ages out
 * again. Windows come from `computeSchoolYearPlan`, the same function the admin
 * planner uses, fed with the same city holiday set, so dev dates land exactly
 * where the planner would have put them.
 *
 * IT ALSO OPENS THE ENROLLMENT WINDOWS. `getActivePrograms` gates on an open
 * `CourseEnrollmentWindow` for the composite (courseId, schoolYear, city) key
 * as well as on the module arc, and an absent or expired window hides a group
 * just as thoroughly as a stale arc. Re-anchoring only the arc let this script
 * report success while `/prijava` stayed empty — the exact confusion it exists
 * to remove. Windows are opened wide rather than to the plan's bounds: in dev
 * the question is always "can I sign somebody up right now".
 *
 * SAFE TO RE-RUN, and safe on a database that was never planned: it upserts by
 * (moduleId, schoolYear, city) and (courseId, schoolYear, city) and never
 * deletes. It touches nothing but `ModuleSchedule` and `CourseEnrollmentWindow`
 * — groups, enrollments, attendance and materials are left alone, so a dev
 * database stays usable across a refresh.
 *
 * NOT FOR PRODUCTION. Moving a live year's module windows would move every
 * expected session, every attendance screen and every parent-facing schedule.
 * The guard below refuses a non-local database unless `--force` is passed.
 */
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import type { City } from '@prisma/client'
import { db } from '../src/lib/db'
import { computeSchoolYear } from '../src/lib/school-year'
import { computeSchoolYearPlan, MODULE_COUNT } from '../src/lib/school-year-planner'
import { ACTIVE_WEEKDAYS } from '../src/lib/group-end-dates'
import { loadHolidayDateKeys } from '../src/lib/holidays'
import { toDateKey } from '../src/lib/session-dates'

/** How far back Modul 1 starts. Two weeks in ⇒ it is running and M2–M4 are ahead. */
const KICKOFF_WEEKS_AGO = 2

/**
 * How wide to open the upisi window. Deliberately generous — a dev database
 * wants "signup is open", not a faithful reproduction of a real window.
 */
const WINDOW_OPEN = new Date('2020-01-01')
const WINDOW_CLOSE = new Date('2099-12-31')

const apply = process.argv.includes('--apply')
const force = process.argv.includes('--force')

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? ''
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url)
  if (isLocal || force) return
  console.error(
    '✗ DATABASE_URL does not look local. This script rewrites module windows for the\n' +
      '  whole school year — on a live database that moves every session date and every\n' +
      '  schedule already sent to parents. Pass --force only if you truly mean it.',
  )
  process.exit(1)
}

function kickoffDate(): Date {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - KICKOFF_WEEKS_AGO * 7),
  )
}

/**
 * Which tenants to re-plan: SPLIT always (the dev tenant — a freshly seeded
 * database has no groups yet, and specs that create one still need the arc to
 * exist), plus any city that already has standard groups or dated windows.
 *
 * Deliberately NOT every city in the enum: `40-sibenik-city-journey` plans
 * Šibenik itself and the planner refuses a year that already has dates, so
 * stamping a tenant nobody has planned would take that spec's subject away.
 */
async function citiesToPlan(schoolYear: string): Promise<City[]> {
  const [groupCities, scheduleCities] = await Promise.all([
    db.scheduledGroup.findMany({
      where: { schoolYear, course: { kind: 'STANDARD' } },
      select: { city: true },
      distinct: ['city'],
    }),
    db.moduleSchedule.findMany({
      where: { schoolYear, module: { course: { kind: 'STANDARD' } } },
      select: { city: true },
      distinct: ['city'],
    }),
  ])
  return [
    ...new Set<City>([
      'SPLIT',
      ...groupCities.map((r) => r.city),
      ...scheduleCities.map((r) => r.city),
    ]),
  ]
}

async function main(): Promise<void> {
  assertLocalDatabase()

  const schoolYear = computeSchoolYear()
  const startDate = kickoffDate()
  const cities = await citiesToPlan(schoolYear)

  console.log(`→ School year ${schoolYear}, kickoff ${toDateKey(startDate)}`)

  const modules = await db.courseModule.findMany({
    where: { course: { kind: 'STANDARD' } },
    select: { id: true, sortOrder: true, courseId: true, course: { select: { title: true } } },
    orderBy: [{ courseId: 'asc' }, { sortOrder: 'asc' }],
  })
  const byCourse = new Map<string, typeof modules>()
  for (const m of modules) {
    byCourse.set(m.courseId, [...(byCourse.get(m.courseId) ?? []), m])
  }

  for (const city of cities) {
    // Same holiday set the planner would use, so a city that lost a week to a
    // holiday keeps its own pacing rather than inheriting the other city's.
    const holidayDates = await loadHolidayDateKeys(schoolYear, city)
    const plan = computeSchoolYearPlan({
      startDate,
      activeWeekdays: ACTIVE_WEEKDAYS,
      holidayDates,
    })

    console.log(`\n  ${city}:`)
    for (const window of plan.modules) {
      console.log(
        `    Modul ${window.moduleIndex}: ${toDateKey(window.startDate)} → ${toDateKey(window.endDate)}`,
      )
    }

    let written = 0
    let skipped = 0
    for (const [, mods] of byCourse) {
      // Position, not raw sortOrder — the seed numbers modules 1..4 and older
      // data 0..3, and "Nth module of the year" is the position either way.
      if (mods.length !== MODULE_COUNT) {
        console.log(
          `    ⚠ "${mods[0]?.course.title}" has ${mods.length} modules, expected ${MODULE_COUNT} — skipped`,
        )
        skipped += mods.length
        continue
      }
      for (const [position, m] of mods.entries()) {
        const window = plan.modules[position]
        if (!window) continue
        if (apply) {
          await db.moduleSchedule.upsert({
            where: { moduleId_schoolYear_city: { moduleId: m.id, schoolYear, city } },
            create: {
              moduleId: m.id,
              schoolYear,
              city,
              startDate: window.startDate,
              endDate: window.endDate,
            },
            update: { startDate: window.startDate, endDate: window.endDate },
          })
        }
        written++
      }
    }
    let windows = 0
    for (const courseId of byCourse.keys()) {
      if (apply) {
        await db.courseEnrollmentWindow.upsert({
          where: { courseId_schoolYear_city: { courseId, schoolYear, city } },
          create: {
            courseId,
            schoolYear,
            city,
            enrollmentStart: WINDOW_OPEN,
            enrollmentEnd: WINDOW_CLOSE,
          },
          update: { enrollmentStart: WINDOW_OPEN, enrollmentEnd: WINDOW_CLOSE },
        })
      }
      windows++
    }

    console.log(
      `    ${apply ? 'Wrote' : 'Would write'} ${written} module window(s)` +
        (skipped > 0 ? `, skipped ${skipped}` : '') +
        ` and ${apply ? 'opened' : 'would open'} ${windows} enrollment window(s)`,
    )
  }

  console.log('')
  console.log(
    apply
      ? '✓ Module arcs re-anchored and upisi opened. Standard groups are offered on /prijava again.'
      : 'Dry run — nothing written. Re-run with --apply to save.',
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
