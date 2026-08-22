/**
 * `cleanupRunFixtures` — the teardown the Playwright specs call (Flux rliq5dg).
 *
 * It lives in tests/helpers/ and runs in the E2E tier, but its risk is pure
 * database ordering: a RESTRICT edge missed in the delete chain throws, the
 * teardown swallows it, and the leak silently continues — which is how the
 * original buildup went unnoticed until /admin/grupe started packing lanes
 * zero-width. Exercising it here proves the order against real FKs without
 * waiting for a browser run.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { cleanupRunFixtures } from '../helpers/cleanup'
import {
  createAdmin,
  createAttendance,
  createCourse,
  createEnrollment,
  createGroup,
  createInquiry,
  createMaterial,
  createModule,
  createModuleEnrollment,
  createModuleSchedule,
  createStudent,
  createTeacher,
  createTeacherAssignment,
  createTeacherAttendance,
} from './helpers/factory'
import { fixtureScope } from './helpers/cleanup'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const survivor = fixtureScope()

// A fresh id per call: this tier shares one database and a run that dies
// mid-seed leaves its course behind, so a fixed literal collides with the
// previous attempt on `Course.slug`.
let runCounter = 0
const nextRunId = () => `e2e${Date.now().toString(36).slice(-5)}${(++runCounter).toString(36)}`

afterAll(async () => {
  await survivor.cleanup()
})

/** Everything a spec run touches, all of it stamped with `runId`. */
async function seedRun(runId: string) {
  const course = await createCourse({
    kind: 'RADIONICA',
    title: `Testna Radionica ${runId}`,
    slug: `testna-radionica-${runId}`,
  })
  const mod = await createModule(course.id, { title: `Modul ${runId}` })
  const schedule = await createModuleSchedule(mod.id, { schoolYear: '2026/2027' })
  const group = await createGroup({
    courseId: course.id,
    name: `Test Grupa STD ${runId}`,
    schoolYear: '2026/2027',
  })
  const teacher = await createTeacher({ email: `teacher-${runId}@test.local` })
  const student = await createStudent({ email: `student-${runId}@test.local` })
  const admin = await createAdmin()
  await createTeacherAssignment(teacher.id, group.id)
  const enrollment = await createEnrollment(student.id, group.id, { schoolYear: '2026/2027' })
  await createModuleEnrollment(enrollment.id, schedule.id)
  await createAttendance(enrollment.id, teacher.id)
  // TeacherAttendance is onDelete: Restrict — the edge most likely to trip.
  await createTeacherAttendance(teacher.id, group.id)
  await createMaterial({ scheduledGroupId: group.id, uploadedById: admin.id })
  await db.studentComment.create({
    data: {
      studentId: student.id,
      groupId: group.id,
      authorId: teacher.id,
      content: 'Bilješka',
    },
  })
  const inquiry = await createInquiry({
    scheduledGroupId: group.id,
    parentEmail: `parent-${runId}@test.local`,
  })
  const looseInquiry = await createInquiry({ childLastName: `Testić${runId}` })

  return { course, group, teacher, student, enrollment, inquiry, looseInquiry }
}

describe('cleanupRunFixtures', () => {
  it('removes a whole run — group, course, people and upiti — despite the RESTRICT edges', async () => {
    const runId = nextRunId()
    const run = await seedRun(runId)

    await cleanupRunFixtures(runId)

    expect(await db.scheduledGroup.findUnique({ where: { id: run.group.id } })).toBeNull()
    expect(await db.course.findUnique({ where: { id: run.course.id } })).toBeNull()
    expect(await db.user.findUnique({ where: { id: run.teacher.id } })).toBeNull()
    expect(await db.user.findUnique({ where: { id: run.student.id } })).toBeNull()
    expect(await db.inquiry.findUnique({ where: { id: run.inquiry.id } })).toBeNull()
    // Also the upit that named no group — it carries the run id in the surname.
    expect(await db.inquiry.findUnique({ where: { id: run.looseInquiry.id } })).toBeNull()
    expect(await db.enrollment.findUnique({ where: { id: run.enrollment.id } })).toBeNull()
    expect(await db.teacherAttendance.count({ where: { scheduledGroupId: run.group.id } })).toBe(0)
  })

  it('removes staff who acted on a group the run did NOT name', async () => {
    // The leak that survived the first version of this teardown, and the reason
    // it went unnoticed: a fixture teacher routinely uploads a material or
    // writes a comment on the SHARED phase3 fixture group, whose name carries no
    // run id. The group sweep cannot reach those rows, `Material.uploadedById`
    // and `StudentComment.authorId` are required relations (RESTRICT), so the
    // account delete threw P2003 — and because this helper swallows, the run
    // went green while leaving its teacher behind for good.
    const runId = nextRunId()
    const run = await seedRun(runId)

    // A group belonging to nobody's run — stands in for the shared fixture group.
    const outsideGroup = await survivor.group()
    const outsideStudent = await createStudent()
    await createEnrollment(outsideStudent.id, outsideGroup.id)

    const strayMaterial = await createMaterial({
      uploadedById: run.teacher.id,
      scheduledGroupId: outsideGroup.id,
    })
    const strayComment = await db.studentComment.create({
      data: {
        studentId: outsideStudent.id,
        groupId: outsideGroup.id,
        authorId: run.teacher.id,
        content: 'Bilješka na tuđoj grupi.',
      },
    })

    await cleanupRunFixtures(runId)

    // The account is actually gone — the assertion the P2003 used to break.
    expect(await db.user.findUnique({ where: { id: run.teacher.id } })).toBeNull()
    expect(await db.material.findUnique({ where: { id: strayMaterial.id } })).toBeNull()
    expect(await db.studentComment.findUnique({ where: { id: strayComment.id } })).toBeNull()

    // …while the group it acted on, and the child in it, are untouched: only the
    // run's OWN rows go, however far outside its groups they reached.
    expect(await db.scheduledGroup.findUnique({ where: { id: outsideGroup.id } })).not.toBeNull()
    expect(await db.user.findUnique({ where: { id: outsideStudent.id } })).not.toBeNull()

    // Not covered by `survivor`, which tracks groups/courses/locations only.
    await db.user.delete({ where: { id: outsideStudent.id } })
  })

  it('leaves another run’s fixtures and ordinary dev data alone', async () => {
    const mineId = nextRunId()
    const theirsId = nextRunId()
    const mine = await seedRun(mineId)
    const theirs = await seedRun(theirsId)
    const untouchedCourse = await survivor.course({ title: 'Stvarni program' })
    const untouchedGroup = await survivor.group({
      courseId: untouchedCourse.id,
      name: 'Stvarna grupa',
    })

    await cleanupRunFixtures(mineId)

    expect(await db.scheduledGroup.findUnique({ where: { id: mine.group.id } })).toBeNull()
    expect(await db.scheduledGroup.findUnique({ where: { id: theirs.group.id } })).not.toBeNull()
    expect(await db.user.findUnique({ where: { id: theirs.teacher.id } })).not.toBeNull()
    expect(
      await db.scheduledGroup.findUnique({ where: { id: untouchedGroup.id } }),
    ).not.toBeNull()

    await cleanupRunFixtures(theirsId)
    expect(await db.scheduledGroup.findUnique({ where: { id: theirs.group.id } })).toBeNull()
  })

  it('is a no-op on an id that never ran, and on a second pass', async () => {
    const runId = nextRunId()
    const run = await seedRun(runId)

    await cleanupRunFixtures(nextRunId())
    expect(await db.scheduledGroup.findUnique({ where: { id: run.group.id } })).not.toBeNull()

    await cleanupRunFixtures(runId)
    // Re-running must not throw on rows that are already gone.
    await cleanupRunFixtures(runId)
    expect(await db.scheduledGroup.findUnique({ where: { id: run.group.id } })).toBeNull()
  })

  it('refuses an empty id rather than matching everything', async () => {
    const survivorCourse = await survivor.course({ title: 'Ne diraj' })
    const survivorGroup = await survivor.group({
      courseId: survivorCourse.id,
      name: 'Ne diraj grupu',
    })

    // `contains: ''` matches every row in the table — the one input that would
    // turn a teardown into a database wipe.
    await cleanupRunFixtures('')

    expect(await db.scheduledGroup.findUnique({ where: { id: survivorGroup.id } })).not.toBeNull()
  })
})
