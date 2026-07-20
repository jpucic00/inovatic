import { beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createGroup,
  createTeacher,
  createTeacherAssignment,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// The city guards 404 via notFound() and the admin guards bounce via
// redirect() — both from next/navigation, both throw in a real request.
// Mirror that here (same shape as api/access-control.test.ts).
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      const err = new Error(`NEXT_REDIRECT: ${url}`)
      ;(err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303;`
      throw err
    }),
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})

// Import after the mocks so the actions pick up the mocked notFound/redirect.
const {
  getTeachers,
  getTeacher,
  getAssignableTeachers,
  getAssignableGroupsForTeacher,
  createTeacher: createTeacherAction,
  updateTeacher,
  resetTeacherPassword,
  deleteTeacher,
  assignTeacherToGroup,
  unassignTeacherFromGroup,
} = await import('@/actions/admin/teacher')

const SY = '2026/2027'

beforeAll(async () => {
  // createTeacher/resetTeacherPassword send credentials emails when
  // RESEND_API_KEY is set; the test environment shouldn't talk to Resend.
  delete process.env.RESEND_API_KEY
  await db.schoolYear.upsert({ where: { label: SY }, create: { label: SY }, update: {} })
})

async function sibenikAdminSession() {
  const admin = await createAdmin({ city: 'SIBENIK' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SIBENIK' })
  return admin
}

describe('getTeachers — city-scoped staff list', () => {
  it('Šibenik admin sees Šibenik teachers but not Split teachers', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await sibenikAdminSession()

    // Scope via search (unique factory lastName) — residue-tolerant.
    const own = await getTeachers({ search: sibTeacher.lastName })
    expect(own.data.map((t) => t.id)).toContain(sibTeacher.id)

    const foreign = await getTeachers({ search: splitTeacher.lastName })
    expect(foreign.data).toHaveLength(0)
    expect(foreign.total).toBe(0)
  })

  it('the city ADMIN herself does not appear in staff management', async () => {
    const admin = await sibenikAdminSession()
    const res = await getTeachers({ search: admin.lastName })
    expect(res.data).toHaveLength(0)
  })
})

describe('getTeacher — cross-city detail is indistinguishable from nonexistent', () => {
  it('returns the row for a same-city teacher, null for a cross-city one', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await sibenikAdminSession()

    const own = await getTeacher(sibTeacher.id)
    expect(own?.id).toBe(sibTeacher.id)

    expect(await getTeacher(splitTeacher.id)).toBeNull()
  })
})

describe('createTeacher — stamps the admin session city', () => {
  it('a Šibenik admin creates a SIBENIK teacher', async () => {
    await sibenikAdminSession()
    const email = `sib-nastavnik-${Date.now()}@test.local`

    const res = await createTeacherAction({
      email,
      firstName: 'Šime',
      lastName: 'Šibenski',
    })
    expect(res.success).toBe(true)
    if (!res.success) return

    const row = await db.user.findUnique({
      where: { id: res.teacherId },
      select: { city: true, role: true },
    })
    expect(row).toMatchObject({ city: 'SIBENIK', role: 'TEACHER' })
  })
})

describe('getAssignableTeachers — same-city TEACHER + ADMIN', () => {
  it('includes the Šibenik ADMIN herself and Šibenik teachers, excludes Split staff and deleted rows', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const sibDeleted = await createTeacher({ city: 'SIBENIK', deletedAt: new Date() })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    const splitAdmin = await createAdmin({ city: 'SPLIT' })
    const admin = await sibenikAdminSession()

    const ids = (await getAssignableTeachers()).map((t) => t.id)
    expect(ids).toContain(sibTeacher.id)
    expect(ids).toContain(admin.id) // ADMIN is assignable to her own groups
    expect(ids).not.toContain(sibDeleted.id)
    expect(ids).not.toContain(splitTeacher.id)
    expect(ids).not.toContain(splitAdmin.id)
  })
})

describe('mutations by id — cross-city 404s, same-city works', () => {
  it('resetTeacherPassword: cross-city throws NEXT_NOT_FOUND, same-city succeeds', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await sibenikAdminSession()

    await expect(resetTeacherPassword(splitTeacher.id)).rejects.toThrow('NEXT_NOT_FOUND')
    const splitRow = await db.user.findUnique({
      where: { id: splitTeacher.id },
      select: { passwordHash: true },
    })
    expect(splitRow?.passwordHash).toBe(splitTeacher.passwordHash)

    const res = await resetTeacherPassword(sibTeacher.id)
    expect(res.success).toBe(true)
  })

  it('updateTeacher: cross-city throws NEXT_NOT_FOUND, same-city succeeds', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await sibenikAdminSession()

    await expect(
      updateTeacher({
        id: splitTeacher.id,
        firstName: 'Hak',
        lastName: 'Pokušaj',
        email: splitTeacher.email,
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    const splitRow = await db.user.findUnique({
      where: { id: splitTeacher.id },
      select: { firstName: true },
    })
    expect(splitRow?.firstName).toBe(splitTeacher.firstName)

    const res = await updateTeacher({
      id: sibTeacher.id,
      firstName: 'Nova',
      lastName: 'Osoba',
      email: sibTeacher.email,
    })
    expect(res).toEqual({ success: true })
  })

  it('deleteTeacher: cross-city throws NEXT_NOT_FOUND and leaves the row live, same-city soft-deletes', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await sibenikAdminSession()

    await expect(deleteTeacher(splitTeacher.id)).rejects.toThrow('NEXT_NOT_FOUND')
    const splitRow = await db.user.findUnique({
      where: { id: splitTeacher.id },
      select: { deletedAt: true },
    })
    expect(splitRow?.deletedAt).toBeNull()

    const res = await deleteTeacher(sibTeacher.id)
    expect(res).toEqual({ success: true })
    const sibRow = await db.user.findUnique({
      where: { id: sibTeacher.id },
      select: { deletedAt: true },
    })
    expect(sibRow?.deletedAt).not.toBeNull()
  })
})

describe('assignTeacherToGroup — same-city only, ADMIN assignees allowed', () => {
  it('rejects a cross-city assignee (Split teacher on a Šibenik group)', async () => {
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    const sibGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    await sibenikAdminSession()

    await expect(
      assignTeacherToGroup({ teacherId: splitTeacher.id, scheduledGroupId: sibGroup.id }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(
      await db.teacherAssignment.count({
        where: { userId: splitTeacher.id, scheduledGroupId: sibGroup.id },
      }),
    ).toBe(0)
  })

  it('rejects a cross-city group (Šibenik teacher on a Split group)', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: SY })
    await sibenikAdminSession()

    await expect(
      assignTeacherToGroup({ teacherId: sibTeacher.id, scheduledGroupId: splitGroup.id }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(
      await db.teacherAssignment.count({
        where: { userId: sibTeacher.id, scheduledGroupId: splitGroup.id },
      }),
    ).toBe(0)
  })

  it('assigns the Šibenik ADMIN to her own group, and unassigning the ADMIN works', async () => {
    const sibGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    const admin = await sibenikAdminSession()

    const res = await assignTeacherToGroup({
      teacherId: admin.id,
      scheduledGroupId: sibGroup.id,
    })
    expect(res).toEqual({ success: true })

    const assignment = await db.teacherAssignment.findUnique({
      where: {
        userId_scheduledGroupId: { userId: admin.id, scheduledGroupId: sibGroup.id },
      },
    })
    expect(assignment).not.toBeNull()

    // Group-level unassign is the ADMIN assignee's only removal path.
    const unassigned = await unassignTeacherFromGroup(assignment!.id)
    expect(unassigned).toEqual({ success: true })
    expect(await db.teacherAssignment.count({ where: { id: assignment!.id } })).toBe(0)
  })

  it('unassign of a cross-city assignment reads as nonexistent and leaves the row', async () => {
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: SY })
    const assignment = await createTeacherAssignment(splitTeacher.id, splitGroup.id)
    await sibenikAdminSession()

    const res = await unassignTeacherFromGroup(assignment.id)
    expect(res).toEqual({ success: false, error: 'Dodjela nije pronađena.' })
    expect(await db.teacherAssignment.count({ where: { id: assignment.id } })).toBe(1)
  })
})

describe('getAssignableGroupsForTeacher — same-city groups only', () => {
  it('offers Šibenik groups and never Split groups', async () => {
    const sibTeacher = await createTeacher({ city: 'SIBENIK' })
    const sibGroup = await createGroup({ city: 'SIBENIK', schoolYear: SY })
    const splitGroup = await createGroup({ city: 'SPLIT', schoolYear: SY })
    await sibenikAdminSession()

    const ids = (await getAssignableGroupsForTeacher(sibTeacher.id)).map((g) => g.id)
    expect(ids).toContain(sibGroup.id)
    expect(ids).not.toContain(splitGroup.id)
  })

  it('404s for a cross-city teacher id', async () => {
    const splitTeacher = await createTeacher({ city: 'SPLIT' })
    await sibenikAdminSession()

    await expect(getAssignableGroupsForTeacher(splitTeacher.id)).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })
})
