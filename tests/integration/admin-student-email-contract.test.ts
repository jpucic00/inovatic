import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createCourse,
  createGroup,
  createInquiry,
  createLocation,
} from './helpers/factory'

// The admin actions call revalidatePath on success. next/cache is a no-op
// outside a request scope; stub it so the action body runs to completion.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Mock the Resend SDK — the only thing src/lib/email/client.ts instantiates —
// so the real sender service runs but no Resend client is built and nothing
// hits the network. `sendMock` is the controllable emails.send.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

beforeAll(() => {
  // Both actions short-circuit the email branch when RESEND_API_KEY is absent.
  // Set a dummy key so the code path actually reaches the (mocked) send.
  process.env.RESEND_API_KEY = 'test_resend_key'
})

afterAll(() => {
  delete process.env.RESEND_API_KEY
})

beforeEach(() => {
  sendMock.mockReset()
})

const { createStudentFromInquiry, createStudentManually } =
  await import('@/actions/admin/student')

async function makeRadionicaGroup() {
  const location = await createLocation()
  const radionica = await createCourse({ kind: 'RADIONICA' })
  const group = await createGroup({
    courseId: radionica.id,
    locationId: location.id,
    maxStudents: 5,
  })
  return { radionica, group }
}

// Since 2026-08-17 neither creation path mails anything: credentials leave the
// building ONLY through the CREDENTIALS e-mail campaign, run once contracts are
// signed. These two tests are the guard on that — the mocked Resend client is
// armed and configured, so a single stray send would show up as a call.
describe('createStudentFromInquiry — mails nothing', () => {
  it('creates the account + enrollment and sends NO e-mail', async () => {
    const admin = await createAdmin()
    const { radionica, group } = await makeRadionicaGroup()
    const marker = `NOMAIL${Date.now().toString(36)}`

    const inquiry = await createInquiry({
      parentName: `${marker} Roditelj`,
      childLastName: marker,
      courseId: radionica.id,
      scheduledGroupId: group.id,
      schoolYear: group.schoolYear,
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentFromInquiry(inquiry.id, group.id)

    expect(res.success).toBe(true)
    if (res.success) {
      const user = await db.user.findUnique({ where: { id: res.studentId } })
      expect(user).not.toBeNull()
      expect(user?.role).toBe('STUDENT')
      // The password is minted and stored — readable on the profile — it is
      // just never mailed from here.
      expect(user?.plainPassword).toBeTruthy()
      const enrollments = await db.enrollment.count({
        where: { userId: res.studentId, scheduledGroupId: group.id },
      })
      expect(enrollments).toBe(1)
    }
    expect(sendMock).not.toHaveBeenCalled()

    const refreshed = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(refreshed?.status).toBe('ACCOUNT_CREATED')
    expect(refreshed?.assignedGroupId).toBe(group.id)
  })
})

describe('createStudentManually — mails nothing', () => {
  it('creates the student + enrollment and sends NO e-mail', async () => {
    const admin = await createAdmin()
    const { group } = await makeRadionicaGroup()
    const marker = `MANUALNOMAIL${Date.now().toString(36)}`

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentManually({
      firstName: 'Ema',
      lastName: marker,
      dateOfBirth: '2015-02-02',
      parentName: 'Roditelj Test',
      parentEmail: `${marker.toLowerCase()}@example.local`,
      parentPhone: null,
      childSchool: null,
      groupId: group.id,
      moduleScheduleIds: [],
    })

    expect(res.success).toBe(true)
    if (res.success) {
      const user = await db.user.findUnique({ where: { id: res.studentId } })
      expect(user).not.toBeNull()
      expect(user?.plainPassword).toBeTruthy()
      const enrollments = await db.enrollment.count({
        where: { userId: res.studentId, scheduledGroupId: group.id },
      })
      expect(enrollments).toBe(1)
    }
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('createStudentFromInquiry — inquiry status pre-flight', () => {
  it('returns "Račun je već stvoren za ovaj upit." for an ACCOUNT_CREATED inquiry', async () => {
    const admin = await createAdmin()
    const { radionica, group } = await makeRadionicaGroup()

    const inquiry = await createInquiry({
      courseId: radionica.id,
      scheduledGroupId: group.id,
      status: 'ACCOUNT_CREATED',
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentFromInquiry(inquiry.id, group.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Račun je već stvoren za ovaj upit.')
    // Pre-flight rejection — no send attempted, no enrollment claimed.
    expect(sendMock).not.toHaveBeenCalled()
    const rows = await db.enrollment.count({ where: { scheduledGroupId: group.id } })
    expect(rows).toBe(0)
  })

  it('returns "Upit je odbijen." for a DECLINED inquiry and leaves it DECLINED', async () => {
    const admin = await createAdmin()
    const { radionica, group } = await makeRadionicaGroup()

    const inquiry = await createInquiry({
      courseId: radionica.id,
      scheduledGroupId: group.id,
      status: 'DECLINED',
    })

    mockSession({ id: admin.id, role: 'ADMIN' })
    const res = await createStudentFromInquiry(inquiry.id, group.id)

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('Upit je odbijen.')
    expect(sendMock).not.toHaveBeenCalled()

    const refreshed = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(refreshed?.status).toBe('DECLINED')
    expect(refreshed?.studentId).toBeNull()
  })
})
