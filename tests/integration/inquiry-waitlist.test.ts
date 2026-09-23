/**
 * Lista čekanja za upite (Flux 2rw2orx).
 *
 * The waitlist is orthogonal to InquiryStatus: any COURSE upit can sit on it.
 * Three things must hold beyond plain CRUD — a waitlisted NEW upit stops
 * holding a seat everywhere capacity is counted, a declined upit on the list
 * can still be turned into an account, and placing the child takes it off.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createEnrollmentWindow,
  createGroup,
  createInquiry,
  relativeDateKey,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'
const mockedCookies = cookies as unknown as Mock

const YEAR = computeSchoolYear()
const OTHER_YEAR = `${Number(YEAR.slice(0, 4)) + 1}/${Number(YEAR.slice(0, 4)) + 2}`

const {
  setInquiryWaitlist,
  removeInquiryFromWaitlist,
  declineInquiry,
  getInquiries,
  getInquiryWaitlist,
  getGroupsForCourse,
  getGroupsForCourseInSelectedYear,
  getWaitlistGroupOptions,
  getInquiryTabCounts,
} = await import('@/actions/admin/inquiry')
const { createStudentFromInquiry } = await import('@/actions/admin/student')
const { getActivePrograms } = await import('@/actions/public/programs')

/** Points the sidebar-year cookie at `year` (it must exist in the SchoolYear registry). */
function selectYear(year: string) {
  mockedCookies.mockResolvedValue({
    get: (name: string) => (name === 'inovatic_school_year' ? { value: year, name } : undefined),
  })
}

/**
 * A school year no other test writes into, so a (city, year)-wide number — a
 * tab count, a queue position — can be asserted exactly on a shared DB.
 */
async function isolatedYear(): Promise<string> {
  const start = 3000 + Math.floor(Math.random() * 6000)
  const label = `${start}/${start + 1}`
  await db.schoolYear.upsert({ where: { label }, create: { label }, update: {} })
  return label
}

beforeAll(async () => {
  delete process.env.RESEND_API_KEY
  selectYear(YEAR)
  await db.schoolYear.upsert({ where: { label: YEAR }, create: { label: YEAR }, update: {} })
  await db.schoolYear.upsert({ where: { label: OTHER_YEAR }, create: { label: OTHER_YEAR }, update: {} })
})

afterEach(() => {
  selectYear(YEAR)
})

/**
 * A radionica in the future: no module arc, so capacity is simply
 * maxStudents − enrollments − reservations, and it stays in the public feed.
 */
async function radionica(maxStudents = 2) {
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
  const course = await createCourse({ kind: 'RADIONICA', schoolYear: YEAR, city: 'SPLIT' })
  const range = { dateStart: relativeDateKey(30), dateEnd: relativeDateKey(32) }
  const group = await createGroup({ courseId: course.id, schoolYear: YEAR, maxStudents, ...range })
  const other = await createGroup({ courseId: course.id, schoolYear: YEAR, maxStudents, ...range })
  return { admin, course, group, other }
}

const upit = (groupId: string | null, courseId: string, extra: Parameters<typeof createInquiry>[0] = {}) =>
  createInquiry({ scheduledGroupId: groupId, courseId, schoolYear: YEAR, ...extra })

async function spotsFor(courseId: string, groupId: string): Promise<number> {
  const groups = await getGroupsForCourse(courseId)
  const g = groups.find((x) => x.id === groupId)
  if (!g) throw new Error('group missing')
  return g.availableSpots
}

describe('setInquiryWaitlist / removeInquiryFromWaitlist', () => {
  it('puts on, edits without losing the queue place, and removes', async () => {
    const { course, group, other } = await radionica()
    const inquiry = await upit(group.id, course.id)

    const put = await setInquiryWaitlist({ id: inquiry.id, groupIds: [other.id], note: ' samo petak ' })
    expect(put.success).toBe(true)
    const first = await db.inquiry.findUniqueOrThrow({
      where: { id: inquiry.id },
      include: { waitlistGroups: true },
    })
    expect(first.waitlistedAt).not.toBeNull()
    expect(first.waitlistNote).toBe('samo petak')
    expect(first.waitlistGroups.map((g) => g.scheduledGroupId)).toEqual([other.id])
    // Status is untouched — the list is a marker, not a lifecycle step.
    expect(first.status).toBe('NEW')

    const edit = await setInquiryWaitlist({ id: inquiry.id, groupIds: [group.id, other.id], note: '' })
    expect(edit.success).toBe(true)
    const edited = await db.inquiry.findUniqueOrThrow({
      where: { id: inquiry.id },
      include: { waitlistGroups: true },
    })
    expect(edited.waitlistedAt?.getTime()).toBe(first.waitlistedAt?.getTime())
    expect(edited.waitlistNote).toBeNull()
    expect(edited.waitlistGroups).toHaveLength(2)

    // Declined directly in the DB — declineInquiry itself would already clear
    // the entry, and a NEW upit cannot leave the list (see below).
    await db.inquiry.update({ where: { id: inquiry.id }, data: { status: 'DECLINED' } })
    expect((await removeInquiryFromWaitlist(inquiry.id)).success).toBe(true)
    const removed = await db.inquiry.findUniqueOrThrow({
      where: { id: inquiry.id },
      include: { waitlistGroups: true },
    })
    expect(removed.waitlistedAt).toBeNull()
    expect(removed.waitlistGroups).toHaveLength(0)
  })

  it('refuses to take a NEW upit off the list and changes nothing', async () => {
    const { course, group, other } = await radionica()
    const inquiry = await upit(group.id, course.id)
    await setInquiryWaitlist({ id: inquiry.id, groupIds: [other.id], note: 'samo petak' })

    const res = await removeInquiryFromWaitlist(inquiry.id)
    expect(res).toEqual({
      success: false,
      error: 'Novi upit se ne može maknuti s liste čekanja. Najprije kreirajte račun ili odbijte upit.',
    })
    const row = await db.inquiry.findUniqueOrThrow({
      where: { id: inquiry.id },
      include: { waitlistGroups: true },
    })
    expect(row.waitlistedAt).not.toBeNull()
    expect(row.waitlistNote).toBe('samo petak')
    expect(row.waitlistGroups.map((g) => g.scheduledGroupId)).toEqual([other.id])
  })

  it('removes a declined or account-created upit', async () => {
    const { course, other } = await radionica()
    for (const status of ['DECLINED', 'ACCOUNT_CREATED'] as const) {
      const inquiry = await upit(null, course.id, { status })
      await setInquiryWaitlist({ id: inquiry.id, groupIds: [other.id], note: '' })
      expect((await removeInquiryFromWaitlist(inquiry.id)).success).toBe(true)
    }
  })

  it('declining a waitlisted upit takes it off the list too', async () => {
    const { course, group, other } = await radionica()
    const inquiry = await upit(group.id, course.id)
    await setInquiryWaitlist({ id: inquiry.id, groupIds: [other.id], note: 'samo petak' })

    expect((await declineInquiry(inquiry.id, 'Obitelj je odustala.')).success).toBe(true)
    const row = await db.inquiry.findUniqueOrThrow({
      where: { id: inquiry.id },
      include: { waitlistGroups: true },
    })
    expect(row.status).toBe('DECLINED')
    expect(row.waitlistedAt).toBeNull()
    expect(row.waitlistNote).toBeNull()
    expect(row.waitlistGroups).toHaveLength(0)
  })

  // The case the rule exists for: the family's seat was released onto the list,
  // another family booked it, and taking the first one off the list used to
  // re-take the same seat — 3 of 2.
  it('never pushes the form group over capacity', async () => {
    const { course, group, other } = await radionica(1)
    const first = await upit(group.id, course.id)
    await setInquiryWaitlist({ id: first.id, groupIds: [other.id], note: '' })
    await upit(group.id, course.id)
    expect(await spotsFor(course.id, group.id)).toBe(0)

    expect((await removeInquiryFromWaitlist(first.id)).success).toBe(false)
    expect(await spotsFor(course.id, group.id)).toBe(0)
  })

  it('accepts any status, including declined and account-created', async () => {
    const { course, other } = await radionica()
    for (const status of ['DECLINED', 'ACCOUNT_CREATED'] as const) {
      const inquiry = await upit(null, course.id, { status })
      expect((await setInquiryWaitlist({ id: inquiry.id, groupIds: [other.id], note: '' })).success).toBe(true)
    }
  })

  it('rejects an empty entry', async () => {
    const { course } = await radionica()
    const inquiry = await upit(null, course.id)
    const res = await setInquiryWaitlist({ id: inquiry.id, groupIds: [], note: '   ' })
    expect(res.success).toBe(false)
  })

  it('refuses a PARTY upit', async () => {
    await radionica()
    const party = await db.inquiry.create({
      data: {
        type: 'PARTY',
        city: 'SPLIT',
        parentName: 'Proslava',
        parentEmail: `party-${Date.now()}@test.local`,
        parentPhone: '+38591000000',
        schoolYear: YEAR,
      },
    })
    const res = await setInquiryWaitlist({ id: party.id, groupIds: [], note: 'x' })
    expect(res.success).toBe(false)
  })

  it('404s a cross-city upit', async () => {
    const { course } = await radionica()
    const sib = await upit(null, course.id, { city: 'SIBENIK' })
    await expect(setInquiryWaitlist({ id: sib.id, groupIds: [], note: 'x' })).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(removeInquiryFromWaitlist(sib.id)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('rejects groups from another city, another school year or a second program', async () => {
    const { course, group } = await radionica()
    const inquiry = await upit(null, course.id)

    const sibGroup = await createGroup({ courseId: course.id, schoolYear: YEAR, city: 'SIBENIK' })
    const nextYearGroup = await createGroup({ courseId: course.id, schoolYear: OTHER_YEAR })
    const secondCourse = await createCourse({ kind: 'RADIONICA', schoolYear: YEAR, city: 'SPLIT' })
    const secondCourseGroup = await createGroup({ courseId: secondCourse.id, schoolYear: YEAR })

    for (const bad of [sibGroup.id, nextYearGroup.id, secondCourseGroup.id]) {
      const res = await setInquiryWaitlist({ id: inquiry.id, groupIds: [group.id, bad], note: '' })
      expect(res.success).toBe(false)
    }
    expect((await db.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).waitlistedAt).toBeNull()
  })
})

describe('a waitlisted NEW upit releases its seat', () => {
  it('in getGroupsForCourse, the public feed and the conversion guard', async () => {
    const { course, group, other } = await radionica(1)
    // A window with null bounds is "unset" (hidden); the feed needs a real open range.
    const day = 24 * 60 * 60 * 1000
    await createEnrollmentWindow(course.id, {
      schoolYear: YEAR,
      city: 'SPLIT',
      enrollmentStart: new Date(Date.now() - day),
      enrollmentEnd: new Date(Date.now() + 60 * day),
    })
    const holder = await upit(group.id, course.id)

    // Held: the one seat is taken by the NEW reservation.
    expect(await spotsFor(course.id, group.id)).toBe(0)
    const publicSpots = async () =>
      (await getActivePrograms('SPLIT'))
        .flatMap((p) => p.groups)
        .find((g) => g.id === group.id)?.availableSpots
    expect(await publicSpots()).toBe(0)

    // A second family cannot take it while it is held.
    const second = await upit(null, course.id)
    expect((await createStudentFromInquiry(second.id, group.id)).success).toBe(false)

    await setInquiryWaitlist({ id: holder.id, groupIds: [other.id], note: '' })

    // Released at every site that counts seats.
    expect(await spotsFor(course.id, group.id)).toBe(1)
    expect(await publicSpots()).toBe(1)
    expect((await createStudentFromInquiry(second.id, group.id)).success).toBe(true)
  })

  it('in getGroupsForCourseInSelectedYear, the add-enrollment and send-schedule picker', async () => {
    const { course, group, other } = await radionica(1)
    const holder = await upit(group.id, course.id)
    const pickerSpots = async () =>
      (await getGroupsForCourseInSelectedYear(course.id)).find((g) => g.id === group.id)?.availableSpots

    expect(await pickerSpots()).toBe(0)
    await setInquiryWaitlist({ id: holder.id, groupIds: [other.id], note: '' })
    expect(await pickerSpots()).toBe(1)
  })
})

describe('getWaitlistGroupOptions', () => {
  it('offers the groups of the upit own school year, not the sidebar year', async () => {
    const { course, group } = await radionica()
    const range = { dateStart: relativeDateKey(30), dateEnd: relativeDateKey(32) }
    const nextYearGroup = await createGroup({ courseId: course.id, schoolYear: OTHER_YEAR, ...range })
    const inquiry = await upit(null, course.id, { schoolYear: OTHER_YEAR })

    // The admin is looking at YEAR; the family signed up for OTHER_YEAR.
    selectYear(YEAR)
    const ids = (await getWaitlistGroupOptions(inquiry.id, course.id)).map((g) => g.id)
    expect(ids).toEqual([nextYearGroup.id])
    expect(ids).not.toContain(group.id)
  })

  it('gives the upit own reserved seat back in its group', async () => {
    const { course, group } = await radionica(1)
    const inquiry = await upit(group.id, course.id)

    // Everyone else sees the one seat as taken by this very reservation.
    expect(await spotsFor(course.id, group.id)).toBe(0)
    const option = (await getWaitlistGroupOptions(inquiry.id, course.id)).find((g) => g.id === group.id)
    expect(option).toMatchObject({ availableSpots: 1, isFull: false })
  })
})

describe('getInquiryTabCounts', () => {
  it('counts only the admin city and the sidebar year, waitlist within all', async () => {
    const { course } = await radionica()
    const year = await isolatedYear()
    const listed = { waitlistedAt: new Date() }

    await upit(null, course.id, { schoolYear: year })
    await upit(null, course.id, { schoolYear: year, status: 'DECLINED' })
    const waiting = await upit(null, course.id, { schoolYear: year })
    await db.inquiry.update({ where: { id: waiting.id }, data: listed })
    // Outside the scope: the other city, and the same city in another year.
    const sib = await upit(null, course.id, { schoolYear: year, city: 'SIBENIK' })
    await db.inquiry.update({ where: { id: sib.id }, data: listed })
    const elsewhere = await upit(null, course.id, { schoolYear: YEAR })
    await db.inquiry.update({ where: { id: elsewhere.id }, data: listed })

    selectYear(year)
    const counts = await getInquiryTabCounts()
    expect(counts).toEqual({ all: 3, waitlist: 1 })
    expect(counts.waitlist).toBeLessThanOrEqual(counts.all)
  })
})

describe('createStudentFromInquiry and the waitlist', () => {
  it('places a waitlisted DECLINED upit and takes it off the list', async () => {
    const { course, other } = await radionica()
    const declined = await upit(null, course.id, { status: 'DECLINED' })
    await setInquiryWaitlist({ id: declined.id, groupIds: [other.id], note: 'petak' })

    const res = await createStudentFromInquiry(declined.id, other.id)
    expect(res.success).toBe(true)

    const after = await db.inquiry.findUniqueOrThrow({
      where: { id: declined.id },
      include: { waitlistGroups: true },
    })
    expect(after.status).toBe('ACCOUNT_CREATED')
    expect(after.waitlistedAt).toBeNull()
    expect(after.waitlistNote).toBeNull()
    expect(after.waitlistGroups).toHaveLength(0)
  })

  it('still refuses a DECLINED upit nobody is waiting on', async () => {
    const { course, other } = await radionica()
    const declined = await upit(null, course.id, { status: 'DECLINED' })
    const res = await createStudentFromInquiry(declined.id, other.id)
    expect(res.success).toBe(false)
  })

  it('clears the list when a waitlisted NEW upit is converted', async () => {
    const { course, group, other } = await radionica()
    const inquiry = await upit(group.id, course.id)
    await setInquiryWaitlist({ id: inquiry.id, groupIds: [other.id], note: '' })

    expect((await createStudentFromInquiry(inquiry.id, other.id)).success).toBe(true)
    expect((await db.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })).waitlistedAt).toBeNull()
  })
})

describe('getInquiries — Lista čekanja view', () => {
  it('returns only waitlisted rows, oldest first, with positions and free-spot flags', async () => {
    const { course, group, other } = await radionica(1)
    // Fill `group` with a NEW reservation so it reads full; `other` stays open.
    await upit(group.id, course.id)

    const a = await upit(null, course.id, { childFirstName: 'Prvi' })
    const b = await upit(null, course.id, { childFirstName: 'Drugi', status: 'DECLINED' })
    const notListed = await upit(null, course.id)

    await setInquiryWaitlist({ id: a.id, groupIds: [group.id], note: '' })
    await setInquiryWaitlist({ id: b.id, groupIds: [group.id, other.id], note: '' })

    const { data } = await getInquiries({ view: 'WAITLIST', courseId: course.id, pageSize: 50 })
    const ids = data.map((r) => r.id)
    expect(ids).toEqual([a.id, b.id])
    expect(ids).not.toContain(notListed.id)

    const [rowA, rowB] = data
    expect(rowA.waitlist?.hasFreeSpot).toBe(false)
    expect(rowB.waitlist?.hasFreeSpot).toBe(true)
    expect(rowB.waitlist!.position!).toBeGreaterThan(rowA.waitlist!.position!)

    const entry = await getInquiryWaitlist(b.id)
    expect(entry?.position).toBe(rowB.waitlist?.position)
    expect(entry?.groups.map((g) => g.id).sort()).toEqual([group.id, other.id].sort())

    // The default view still shows them all, newest first.
    const all = await getInquiries({ courseId: course.id, pageSize: 50 })
    expect(all.data.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id, notListed.id]))
  })
})

describe('getInquiries — queue positions across pages', () => {
  it('numbers a page-2 row by its place in the whole queue', async () => {
    const { course } = await radionica()
    const year = await isolatedYear()
    const base = Date.now() - 60_000
    const queued = []
    for (let i = 0; i < 3; i++) {
      const row = await upit(null, course.id, { schoolYear: year })
      await db.inquiry.update({ where: { id: row.id }, data: { waitlistedAt: new Date(base + i * 1000) } })
      queued.push(row)
    }

    selectYear(year)
    const first = await getInquiries({ view: 'WAITLIST', page: 1, pageSize: 2 })
    const second = await getInquiries({ view: 'WAITLIST', page: 2, pageSize: 2 })

    expect(first.total).toBe(3)
    expect(first.data.map((r) => [r.id, r.waitlist?.position])).toEqual([
      [queued[0].id, 1],
      [queued[1].id, 2],
    ])
    expect(second.data.map((r) => [r.id, r.waitlist?.position])).toEqual([[queued[2].id, 3]])
  })
})

describe('placing one of two waiting families', () => {
  it('clears only the placed family entry', async () => {
    const { course, other } = await radionica()
    const placed = await upit(null, course.id)
    const stillWaiting = await upit(null, course.id)
    await setInquiryWaitlist({ id: placed.id, groupIds: [other.id], note: '' })
    await setInquiryWaitlist({ id: stillWaiting.id, groupIds: [other.id], note: 'petak' })
    const before = await db.inquiry.findUniqueOrThrow({ where: { id: stillWaiting.id } })

    expect((await createStudentFromInquiry(placed.id, other.id)).success).toBe(true)

    const done = await db.inquiry.findUniqueOrThrow({
      where: { id: placed.id },
      include: { waitlistGroups: true },
    })
    expect(done.waitlistedAt).toBeNull()
    expect(done.waitlistGroups).toHaveLength(0)

    const waiting = await db.inquiry.findUniqueOrThrow({
      where: { id: stillWaiting.id },
      include: { waitlistGroups: true },
    })
    expect(waiting.status).toBe('NEW')
    expect(waiting.waitlistedAt?.getTime()).toBe(before.waitlistedAt?.getTime())
    expect(waiting.waitlistNote).toBe('petak')
    expect(waiting.waitlistGroups.map((g) => g.scheduledGroupId)).toEqual([other.id])
  })
})

describe('group deletion', () => {
  it('removes the group from every waitlist entry', async () => {
    const { course, other } = await radionica()
    const inquiry = await upit(null, course.id)
    await setInquiryWaitlist({ id: inquiry.id, groupIds: [other.id], note: 'x' })

    await db.scheduledGroup.delete({ where: { id: other.id } })

    const after = await db.inquiry.findUniqueOrThrow({
      where: { id: inquiry.id },
      include: { waitlistGroups: true },
    })
    expect(after.waitlistGroups).toHaveLength(0)
    // The entry itself survives — the family is still waiting, just not for that group.
    expect(after.waitlistedAt).not.toBeNull()
  })
})
