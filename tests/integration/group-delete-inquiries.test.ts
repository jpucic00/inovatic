/**
 * Deleting a group that once had upiti. Only an unresolved (NEW) upit blocks —
 * waitlisted or not — while resolved ones survive the delete with their link
 * to the group nulled by the FK (ON DELETE SET NULL). Both paths that drop
 * groups follow the rule: `deleteGroup` and the radionica `deleteCourse`.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { InquiryStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createInquiry, createStudent } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { deleteGroup } = await import('@/actions/admin/group')
const { deleteCourse } = await import('@/actions/admin/course')

const SY = '2026/2027'
const fx = fixtureScope()
const inquiryIds: string[] = []

afterAll(async () => {
  await db.inquiry.deleteMany({ where: { id: { in: inquiryIds } } })
  await fx.cleanup()
})

async function inquiry(overrides: Parameters<typeof createInquiry>[0]) {
  const row = await createInquiry({ schoolYear: SY, ...overrides })
  inquiryIds.push(row.id)
  return row
}

async function asAdmin() {
  const admin = await createAdmin()
  mockSession({ id: admin.id, role: 'ADMIN' })
}

describe('deleteGroup — upiti', () => {
  it('deletes a group whose upiti are all resolved and keeps them, unlinked', async () => {
    await asAdmin()
    const group = await fx.group({ schoolYear: SY })
    const student = await createStudent()
    const declined = await inquiry({
      status: InquiryStatus.DECLINED,
      scheduledGroupId: group.id,
    })
    const converted = await inquiry({
      status: InquiryStatus.ACCOUNT_CREATED,
      scheduledGroupId: group.id,
      assignedGroupId: group.id,
    })
    await db.inquiry.update({ where: { id: converted.id }, data: { studentId: student.id } })

    const res = await deleteGroup(group.id)

    expect(res).toEqual({ success: true })
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(0)
    const after = await db.inquiry.findMany({
      where: { id: { in: [declined.id, converted.id] } },
      select: { id: true, status: true, scheduledGroupId: true, assignedGroupId: true, studentId: true },
    })
    expect(after).toHaveLength(2)
    for (const row of after) {
      expect(row.scheduledGroupId).toBeNull()
      expect(row.assignedGroupId).toBeNull()
    }
    // Everything but the link survives — status and the created account included.
    expect(after.find((r) => r.id === converted.id)).toMatchObject({
      status: InquiryStatus.ACCOUNT_CREATED,
      studentId: student.id,
    })
  })

  it('refuses while an upit for the group is still NEW', async () => {
    await asAdmin()
    const group = await fx.group({ schoolYear: SY })
    await inquiry({ status: InquiryStatus.DECLINED, scheduledGroupId: group.id })
    const open = await inquiry({ status: InquiryStatus.NEW, scheduledGroupId: group.id })

    const res = await deleteGroup(group.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/1 neobrađeni upit/)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
    const row = await db.inquiry.findUniqueOrThrow({ where: { id: open.id } })
    expect(row.scheduledGroupId).toBe(group.id)
  })

  it('a waitlisted NEW upit still blocks — it has not been answered', async () => {
    await asAdmin()
    const group = await fx.group({ schoolYear: SY })
    const waiting = await inquiry({ status: InquiryStatus.NEW, scheduledGroupId: group.id })
    await db.inquiry.update({ where: { id: waiting.id }, data: { waitlistedAt: new Date() } })
    await inquiry({ status: InquiryStatus.NEW, scheduledGroupId: group.id })

    const res = await deleteGroup(group.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/2 neobrađena upita/)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
  })

  it('a NEW upit on another group does not block', async () => {
    await asAdmin()
    const group = await fx.group({ schoolYear: SY })
    const other = await fx.group({ schoolYear: SY })
    await inquiry({ status: InquiryStatus.NEW, scheduledGroupId: other.id })

    expect(await deleteGroup(group.id)).toEqual({ success: true })
  })

  it('a NEW upit naming the group only as its assigned group blocks', async () => {
    await asAdmin()
    const group = await fx.group({ schoolYear: SY })
    const other = await fx.group({ schoolYear: SY })
    await inquiry({ status: InquiryStatus.NEW, scheduledGroupId: other.id, assignedGroupId: group.id })

    const res = await deleteGroup(group.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/1 neobrađeni upit/)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
  })

  it('a waitlisted NEW upit blocks every group it waits for, not just its booked one', async () => {
    await asAdmin()
    const booked = await fx.group({ schoolYear: SY })
    const canAttend = await fx.group({ schoolYear: SY })
    const waiting = await inquiry({ status: InquiryStatus.NEW, scheduledGroupId: booked.id })
    await db.inquiry.update({
      where: { id: waiting.id },
      data: { waitlistedAt: new Date(), waitlistGroups: { create: { scheduledGroupId: canAttend.id } } },
    })

    const res = await deleteGroup(canAttend.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/1 neobrađeni upit/)
    expect(await db.scheduledGroup.count({ where: { id: canAttend.id } })).toBe(1)
    expect(await db.inquiryWaitlistGroup.count({ where: { inquiryId: waiting.id } })).toBe(1)
  })

  it('a resolved waitlisted upit does not block — it keeps its place, minus that group', async () => {
    await asAdmin()
    const group = await fx.group({ schoolYear: SY })
    const other = await fx.group({ schoolYear: SY })
    const declined = await inquiry({ status: InquiryStatus.DECLINED, scheduledGroupId: other.id })
    await db.inquiry.update({
      where: { id: declined.id },
      data: {
        waitlistedAt: new Date(),
        waitlistGroups: { create: [{ scheduledGroupId: group.id }, { scheduledGroupId: other.id }] },
      },
    })

    expect(await deleteGroup(group.id)).toEqual({ success: true })
    const after = await db.inquiry.findUniqueOrThrow({
      where: { id: declined.id },
      select: { waitlistedAt: true, waitlistGroups: { select: { scheduledGroupId: true } } },
    })
    expect(after.waitlistedAt).not.toBeNull()
    expect(after.waitlistGroups).toEqual([{ scheduledGroupId: other.id }])
  })

  it('still refuses a cross-city group', async () => {
    await asAdmin()
    const group = await fx.group({ schoolYear: SY, city: 'SIBENIK' })
    await inquiry({ status: InquiryStatus.DECLINED, scheduledGroupId: group.id, city: 'SIBENIK' })

    await expect(deleteGroup(group.id)).rejects.toThrow(/404/)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
  })

  it('still refuses a group in an archived year', async () => {
    await asAdmin()
    const ARCHIVED = '2020/2021'
    await db.schoolYear.upsert({ where: { label: ARCHIVED }, create: { label: ARCHIVED }, update: {} })
    const group = await fx.group({ schoolYear: ARCHIVED })
    await inquiry({ status: InquiryStatus.DECLINED, scheduledGroupId: group.id })

    const res = await deleteGroup(group.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/Arhivirana/i)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
  })
})

describe('deleteCourse (radionica) — upiti', () => {
  it('deletes a radionica whose termini only have resolved upiti', async () => {
    await asAdmin()
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: SY })
    const group = await fx.group({ courseId: course.id, dateStart: '2027-02-01', dateEnd: '2027-02-05' })
    const declined = await inquiry({
      status: InquiryStatus.DECLINED,
      courseId: course.id,
      scheduledGroupId: group.id,
    })

    const res = await deleteCourse(course.id)

    expect(res).toEqual({ success: true })
    expect(await db.course.count({ where: { id: course.id } })).toBe(0)
    const row = await db.inquiry.findUniqueOrThrow({ where: { id: declined.id } })
    expect(row.scheduledGroupId).toBeNull()
  })

  it('refuses while a termin has a NEW upit, naming the group', async () => {
    await asAdmin()
    const course = await fx.course({ kind: 'RADIONICA', schoolYear: SY })
    const group = await fx.group({
      courseId: course.id,
      name: 'Termin B',
      dateStart: '2027-03-01',
      dateEnd: '2027-03-05',
    })
    await inquiry({ status: InquiryStatus.NEW, courseId: course.id, scheduledGroupId: group.id })

    const res = await deleteCourse(course.id)

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('Termin B')
      expect(res.error).toMatch(/neobrađeni upit/)
    }
    expect(await db.course.count({ where: { id: course.id } })).toBe(1)
    expect(await db.scheduledGroup.count({ where: { id: group.id } })).toBe(1)
  })
})
