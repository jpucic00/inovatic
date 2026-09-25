/**
 * Standard-program module windows are DERIVED, never edited.
 *
 * A (city, school year) plan is exactly two inputs: the kickoff date (module 1's
 * start, written once by "Dovrši plan") and that city's holidays. Every
 * `ModuleSchedule` window of a standard program follows from those two through
 * `computeSchoolYearPlan`, so whenever a holiday is added or removed the four
 * windows are re-derived — in the same transaction as the holiday write, so the
 * Kalendar summary and the payment "due" rule never read windows that disagree
 * with the holidays they were computed from.
 *
 * The rows themselves stay (ModuleEnrollment and the per-module paid marks hang
 * off them); only their dates move. A plain module, not `'use server'`: every
 * export of an action file is a callable endpoint, and this takes no guard.
 */
import type { City, Prisma } from '@prisma/client'
import { ACTIVE_WEEKDAYS } from '@/lib/group-end-dates'
import { isArchivedYear } from '@/lib/school-year'
import { computeSchoolYearPlan, MODULE_COUNT } from '@/lib/school-year-planner'
import { toDateKey } from '@/lib/session-dates'

type ModuleWindow = { startDate: Date; endDate: Date }

type PlanTx = Pick<
  Prisma.TransactionClient,
  'course' | 'moduleSchedule' | 'schoolYearHoliday' | '$executeRaw'
>

/**
 * Serialise every plan write of one (city, school year) until the transaction
 * ends. Under READ COMMITTED two holiday edits would otherwise each re-derive
 * without seeing the other's holiday, and the later commit would overwrite the
 * windows with a plan that is missing one of them. Holidays must be read AFTER
 * this returns. One helper, so the lock key cannot drift between callers.
 */
export async function lockSchoolYearPlan(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  input: { city: City; schoolYear: string },
): Promise<void> {
  const key = `plan:${input.city}:${input.schoolYear}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

/**
 * Upsert one course's module windows by POSITION in its sortOrder-sorted module
 * list — not by the raw sortOrder, which is 1..4 in the seed and 0..3 elsewhere.
 * Position is the single meaning of "Nth module of the year".
 */
export async function writeModuleWindows(
  tx: Pick<Prisma.TransactionClient, 'moduleSchedule'>,
  input: {
    city: City
    schoolYear: string
    moduleIds: ReadonlyArray<string>
    windows: ReadonlyArray<ModuleWindow>
  },
): Promise<void> {
  const { city, schoolYear } = input
  for (const [position, moduleId] of input.moduleIds.entries()) {
    const window = input.windows[position]
    if (!window) continue
    const dates = { startDate: window.startDate, endDate: window.endDate }
    await tx.moduleSchedule.upsert({
      where: { moduleId_schoolYear_city: { moduleId, schoolYear, city } },
      create: { moduleId, schoolYear, city, ...dates },
      update: dates,
    })
  }
}

/**
 * The windows one course should have, or null when it has no plan to follow:
 * no module-1 start in this year (never planned), or not exactly MODULE_COUNT
 * modules (the 4×7 curriculum cannot be laid over it — "Dovrši plan" refuses
 * the same shape). Each course is derived from its OWN kickoff, so nothing
 * assumes every program shares one start date.
 */
export function rederivedModuleWindows(input: {
  moduleStartDates: ReadonlyArray<Date | null>
  holidayDates: ReadonlySet<string>
}): ModuleWindow[] | null {
  if (input.moduleStartDates.length !== MODULE_COUNT) return null
  const kickoff = input.moduleStartDates[0]
  if (!kickoff) return null
  return computeSchoolYearPlan({
    startDate: kickoff,
    activeWeekdays: ACTIVE_WEEKDAYS,
    holidayDates: input.holidayDates,
  }).modules.map((m) => ({ startDate: m.startDate, endDate: m.endDate }))
}

/**
 * Re-derive every standard program's module windows for one (city, school
 * year) from its module-1 start and the holidays as they stand inside `tx`.
 * Call it after the holiday write, in the same transaction. An archived year
 * is never rewritten; a year without a plan is left alone.
 */
export async function rederiveModuleWindows(
  tx: PlanTx,
  input: { city: City; schoolYear: string },
): Promise<void> {
  const { city, schoolYear } = input
  if (isArchivedYear(schoolYear)) return

  await lockSchoolYearPlan(tx, input)
  const [courses, holidayRows] = await Promise.all([
    tx.course.findMany({
      where: { kind: 'STANDARD' },
      select: {
        modules: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            schedules: { where: { schoolYear, city }, select: { startDate: true } },
          },
        },
      },
    }),
    tx.schoolYearHoliday.findMany({ where: { schoolYear, city }, select: { date: true } }),
  ])
  const holidayDates = new Set(holidayRows.map((h) => toDateKey(h.date)))

  for (const course of courses) {
    const windows = rederivedModuleWindows({
      moduleStartDates: course.modules.map((m) => m.schedules[0]?.startDate ?? null),
      holidayDates,
    })
    if (!windows) continue
    await writeModuleWindows(tx, {
      city,
      schoolYear,
      moduleIds: course.modules.map((m) => m.id),
      windows,
    })
  }
}
