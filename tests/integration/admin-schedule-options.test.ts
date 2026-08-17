/**
 * `sendScheduleOptions` — the termini an admin offers a parent (Flux t5f6sss).
 *
 * The payload is built from the group rows, and a radionica formats differently
 * from a standard group: a date RANGE instead of a weekday. Getting that wrong
 * mails a parent "Ponedjeljak · 17:00–18:30" for a workshop that runs five
 * consecutive days, and nothing downstream would notice — the send succeeds
 * either way.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { createAdmin, createInquiry, relativeDateKey } from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'
import { mockSession } from './setup'

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

// Intercept the sender rather than Resend: what is under test is the argument
// the action computes. Typed off the real sender so a signature change breaks
// this file loudly.
type ScheduleSender = typeof import('@/lib/email').sendScheduleOptionsEmail
const { sendScheduleOptionsEmail } = vi.hoisted(() => ({
  sendScheduleOptionsEmail: vi.fn<ScheduleSender>(),
}))
vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>('@/lib/email')
  return { ...actual, sendScheduleOptionsEmail }
})

const { sendScheduleOptions } = await import('@/actions/admin/inquiry')

const scope = fixtureScope()

beforeEach(async () => {
  sendScheduleOptionsEmail.mockReset()
  sendScheduleOptionsEmail.mockResolvedValue(true)
  const admin = await createAdmin({ city: 'SPLIT' })
  mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })
})

afterAll(async () => {
  await scope.cleanup()
})

/** The single option the action built for `groupId`. */
function sentOptions() {
  expect(sendScheduleOptionsEmail).toHaveBeenCalledTimes(1)
  return sendScheduleOptionsEmail.mock.calls[0][0]
}

describe('sendScheduleOptions — the schedule string per program kind', () => {
  it('describes a radionica by its date range, not by a weekday', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const location = await scope.location({ city: 'SPLIT', name: 'Trokut' })
    const group = await scope.group({
      courseId: course.id,
      locationId: location.id,
      city: 'SPLIT',
      name: 'Ljetna radionica',
      dateStart: '2026-09-14',
      dateEnd: '2026-09-18',
      startTime: '17:00',
      endTime: '18:30',
    })
    const inquiry = await createInquiry({ city: 'SPLIT' })

    const res = await sendScheduleOptions(inquiry.id, [group.id])

    expect(res).toEqual({ success: true })
    const payload = sentOptions()
    expect(payload.to).toBe(inquiry.parentEmail)
    expect(payload.city).toBe('SPLIT')
    expect(payload.options).toEqual([
      {
        groupName: 'Ljetna radionica',
        schedule: '14.09.2026. – 18.09.2026. · 17:00–18:30',
        locationName: 'Trokut',
        locationAddress: location.address,
      },
    ])
  })

  it('describes a standard group by its weekday', async () => {
    const course = await scope.course({ kind: 'STANDARD' })
    const group = await scope.group({
      courseId: course.id,
      city: 'SPLIT',
      name: 'SLR 1 – ponedjeljkom',
      dayOfWeek: 'Ponedjeljak',
      startTime: '17:00',
      endTime: '18:30',
    })
    const inquiry = await createInquiry({ city: 'SPLIT' })

    await sendScheduleOptions(inquiry.id, [group.id])

    expect(sentOptions().options[0].schedule).toBe('Ponedjeljak · 17:00–18:30')
  })

  it('collapses a one-day workshop to a single date', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const group = await scope.group({
      courseId: course.id,
      city: 'SPLIT',
      dateStart: '2026-09-14',
      dateEnd: '2026-09-14',
      startTime: '10:00',
      endTime: '13:00',
    })
    const inquiry = await createInquiry({ city: 'SPLIT' })

    await sendScheduleOptions(inquiry.id, [group.id])

    expect(sentOptions().options[0].schedule).toBe('14.09.2026. · 10:00–13:00')
  })
})

describe('sendScheduleOptions — what it refuses to send', () => {
  it('surfaces a send failure instead of reporting success', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const group = await scope.group({
      courseId: course.id,
      city: 'SPLIT',
      dateStart: relativeDateKey(20),
      dateEnd: relativeDateKey(24),
    })
    const inquiry = await createInquiry({ city: 'SPLIT' })
    sendScheduleOptionsEmail.mockRejectedValue(new Error('resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await sendScheduleOptions(inquiry.id, [group.id])

    // Unlike the confirmation mails, this one is the admin's deliberate action —
    // they need to know the parent never got the termini.
    expect(res).toEqual({ success: false, error: 'Greška pri slanju rasporeda.' })
  })

  it('refuses a group from another city and mails nothing', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const sibenikLocation = await scope.location({ city: 'SIBENIK' })
    const group = await scope.group({
      courseId: course.id,
      locationId: sibenikLocation.id,
      city: 'SIBENIK',
      dateStart: relativeDateKey(20),
      dateEnd: relativeDateKey(24),
    })
    const inquiry = await createInquiry({ city: 'SPLIT' })

    const res = await sendScheduleOptions(inquiry.id, [group.id])

    expect(res).toEqual({ success: false, error: 'Nevaljani podaci.' })
    expect(sendScheduleOptionsEmail).not.toHaveBeenCalled()
  })

  it('refuses an upit that is no longer new', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const group = await scope.group({
      courseId: course.id,
      city: 'SPLIT',
      dateStart: relativeDateKey(20),
      dateEnd: relativeDateKey(24),
    })
    const inquiry = await createInquiry({ city: 'SPLIT', status: 'DECLINED' })

    const res = await sendScheduleOptions(inquiry.id, [group.id])

    expect(res).toEqual({ success: false, error: 'Upit mora biti u statusu "Nova".' })
    expect(sendScheduleOptionsEmail).not.toHaveBeenCalled()
  })

  it('404s on an upit from another city', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const group = await scope.group({
      courseId: course.id,
      city: 'SPLIT',
      dateStart: relativeDateKey(20),
      dateEnd: relativeDateKey(24),
    })
    const inquiry = await createInquiry({ city: 'SIBENIK' })

    await expect(sendScheduleOptions(inquiry.id, [group.id])).rejects.toThrow('NEXT_NOT_FOUND')
    expect(sendScheduleOptionsEmail).not.toHaveBeenCalled()
  })

  it('leaves the upit NEW so the admin can offer termini again', async () => {
    const course = await scope.course({ kind: 'RADIONICA' })
    const group = await scope.group({
      courseId: course.id,
      city: 'SPLIT',
      dateStart: relativeDateKey(20),
      dateEnd: relativeDateKey(24),
    })
    const inquiry = await createInquiry({ city: 'SPLIT' })

    await sendScheduleOptions(inquiry.id, [group.id])

    const row = await db.inquiry.findUniqueOrThrow({ where: { id: inquiry.id } })
    expect(row.status).toBe('NEW')
  })
})
