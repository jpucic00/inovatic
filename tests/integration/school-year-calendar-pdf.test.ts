/**
 * The "Raspored radionica" PDF download: admin-only, the admin's own city, and
 * a refusal rather than a short calendar when the year is not fully planned.
 *
 * Far-future school years keep these fixtures out of every other file's way:
 * the loader reads every STANDARD course's windows for (city, year), so a year
 * another test also plans would leak its windows in here.
 */
import { describe, expect, it } from 'vitest'
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createModule,
  createModuleSchedule,
  createStudent,
  createTeacher,
} from './helpers/factory'
import { ACTIVE_WEEKDAYS } from '@/lib/group-end-dates'
import { computeSchoolYearPlan } from '@/lib/school-year-planner'
import { fromDateKey } from '@/lib/session-dates'

const { GET } = await import('@/app/api/admin/school-year-calendar/route')
const { loadSchoolYearCalendar } = await import('@/lib/school-year-calendar-data')

const SPLIT_ONLY_YEAR = '2081/2082'
const BOTH_CITIES_YEAR = '2082/2083'

/** A complete 4×7 plan for one standard course, the way "Dovrši plan" writes it. */
async function planYear(city: City, schoolYear: string, kickoff: string, holidays: string[] = []) {
  const holidayDates = new Set(holidays)
  const plan = computeSchoolYearPlan({
    startDate: fromDateKey(kickoff),
    activeWeekdays: ACTIVE_WEEKDAYS,
    holidayDates,
  })
  const course = await createCourse({ kind: 'STANDARD' })
  for (const [i, window] of plan.modules.entries()) {
    const mod = await createModule(course.id, { sortOrder: i })
    await createModuleSchedule(mod.id, {
      schoolYear,
      city,
      startDate: window.startDate,
      endDate: window.endDate,
    })
  }
  await db.schoolYear.upsert({ where: { label: schoolYear }, create: { label: schoolYear }, update: {} })
  for (const date of holidays) {
    // Upsert: the file must survive a re-run without the tier's reset.
    await db.schoolYearHoliday.upsert({
      where: { schoolYear_city_date: { schoolYear, city, date: fromDateKey(date) } },
      create: { schoolYear, city, date: fromDateKey(date), name: null },
      update: {},
    })
  }
}

function download(year: string) {
  return GET(
    new Request(
      `http://localhost/api/admin/school-year-calendar?year=${encodeURIComponent(year)}`,
    ),
  )
}

await planYear('SPLIT', SPLIT_ONLY_YEAR, '2081-10-06')
await planYear('SPLIT', BOTH_CITIES_YEAR, '2082-10-05')
await planYear('SIBENIK', BOTH_CITIES_YEAR, '2082-11-02', ['2082-11-18'])

describe('GET /api/admin/school-year-calendar', () => {
  it('returns a one-page PDF with a Croatian filename for a planned year', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await download(SPLIT_ONLY_YEAR)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment;')
    expect(disposition).toContain(
      `filename*=UTF-8''${encodeURIComponent('Raspored radionica 2081.-2082. – Split.pdf')}`,
    )
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1)
  }, 30_000)

  it("prints the SESSION's city — a Šibenik admin cannot get Split's year", async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const res = await download(SPLIT_ONLY_YEAR)

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('nema dovršen plan')
  })

  it('gives a Šibenik admin their own plan when both cities have one', async () => {
    const admin = await createAdmin({ city: 'SIBENIK' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })

    const res = await download(BOTH_CITIES_YEAR)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain(
      encodeURIComponent('– Šibenik.pdf'),
    )
  }, 30_000)

  it('refuses a teacher, a student and a guest', async () => {
    const teacher = await createTeacher({ city: 'SPLIT' })
    mockSession({ id: teacher.id, role: 'TEACHER', city: 'SPLIT' })
    expect((await download(SPLIT_ONLY_YEAR)).status).toBe(401)

    const student = await createStudent({ city: 'SPLIT' })
    mockSession({ id: student.id, role: 'STUDENT', city: 'SPLIT' })
    expect((await download(SPLIT_ONLY_YEAR)).status).toBe(401)

    mockSession(null)
    expect((await download(SPLIT_ONLY_YEAR)).status).toBe(401)
  })

  it('fails closed on an admin session without a city claim', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: null })
    expect((await download(SPLIT_ONLY_YEAR)).status).toBe(401)
  })

  it('rejects a malformed year and explains an unplanned one', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    expect((await download('2081-2082')).status).toBe(400)

    const res = await download('2079/2080')
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toContain('Dovršite plan u Kalendaru')
  })
})

describe('loadSchoolYearCalendar', () => {
  it("draws each city's own windows and holidays", async () => {
    const split = await loadSchoolYearCalendar('SPLIT', BOTH_CITIES_YEAR)
    const sibenik = await loadSchoolYearCalendar('SIBENIK', BOTH_CITIES_YEAR)
    if (!split.ok || !sibenik.ok) throw new Error('both cities are planned')

    const firstMonth = (c: typeof split) =>
      c.ok ? c.calendar.months[0]?.label : undefined
    expect(firstMonth(split)).toBe('Listopad')
    expect(firstMonth(sibenik)).toBe('Studeni')

    const cells = sibenik.calendar.months.flatMap((m) => m.weeks.flat())
    expect(cells.find((c) => c.dateKey === '2082-11-18')?.state).toBe('HOLIDAY')
    const splitCells = split.calendar.months.flatMap((m) => m.weeks.flat())
    expect(splitCells.find((c) => c.dateKey === '2082-11-18')?.state).toBe('SESSION')
  })
})
