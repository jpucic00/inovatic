/**
 * Which module tab the group gallery opens on (`activeModuleId`) is paced off
 * the GROUP'S own school year — never the year today's date names. Module rows
 * are shared across years and every year has its own dates, so reading today's
 * year opens a past group, or a next-year group in summer, on another year's
 * calendar.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { buildGroupGalleryView } from '@/lib/group-gallery-view'
import { createModule, createModuleSchedule } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

const fx = fixtureScope()

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await fx.cleanup()
})

// Own years so these schedules cannot reach any other test's arc.
const PAST = '2036/2037'
const NEXT = '2037/2038'

async function twoYearCourse() {
  const course = await fx.course({ kind: 'STANDARD' })
  const m1 = await createModule(course.id, { title: 'Modul 1', sortOrder: 0 })
  const m2 = await createModule(course.id, { title: 'Modul 2', sortOrder: 1 })
  const plan = (moduleId: string, schoolYear: string, start: string, end: string) =>
    createModuleSchedule(moduleId, {
      schoolYear,
      city: 'SPLIT',
      startDate: new Date(`${start}T00:00:00Z`),
      endDate: new Date(`${end}T00:00:00Z`),
    })
  await plan(m1.id, PAST, '2036-10-01', '2036-11-30')
  await plan(m2.id, PAST, '2037-01-07', '2037-06-15')
  await plan(m1.id, NEXT, '2037-10-01', '2037-11-30')
  await plan(m2.id, NEXT, '2038-01-07', '2038-06-15')
  return { course, m1, m2 }
}

describe('buildGroupGalleryView — default tab', () => {
  it("opens a past group on its own last module after 1 September, not the new year's first", async () => {
    const { course, m2 } = await twoYearCourse()
    const group = await fx.group({ courseId: course.id, dayOfWeek: 'Ponedjeljak', city: 'SPLIT', schoolYear: PAST })

    // October: the new year's module 1 is running, but this group finished in June.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2037-10-20T10:00:00Z') })
    const view = await buildGroupGalleryView(group.id)

    expect(view.activeModuleId).toBe(m2.id)
  })

  it('opens a next-year group on module 1 in summer, not on the ending year’s last module', async () => {
    const { course, m1 } = await twoYearCourse()
    const group = await fx.group({ courseId: course.id, dayOfWeek: 'Ponedjeljak', city: 'SPLIT', schoolYear: NEXT })

    // Mid-July: today still names the ending year, whose modules are all done.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2037-07-15T10:00:00Z') })
    const view = await buildGroupGalleryView(group.id)

    expect(view.activeModuleId).toBe(m1.id)
  })
})
