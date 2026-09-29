/**
 * Direct-Prisma seed helpers for Playwright tests — bypasses the admin UI
 * dialogs the equivalent helpers in `phase3.ts` drive. Each UI-based call
 * costs 25-50s of clicks/dialogs/waits; the Prisma insert returns the same
 * row in <2s.
 *
 * **Coverage note**: the admin "Kreiraj učenika" / "Kreiraj nastavnika"
 * dialogs (form validation, password generation, email shape) are still
 * exercised by `tests/phase2/17-students.spec.ts` and
 * `tests/phase2/19-teachers.spec.ts` — those keep using the UI helpers in
 * `phase3.ts` as deliberate dialog-regression guards for every other spec.
 *
 * Shapes match the UI helpers (TeacherData / StudentData) so spec
 * `beforeAll`s can drop in `seedTeacher` / `seedStudentInGroup` with a
 * one-line rename (no `page` argument needed).
 *
 * Re-uses the shared Prisma client from `@/lib/db`, which reads
 * `DATABASE_URL` at process startup — works against whatever DB the
 * Playwright run is pointed at (dev `inovatic` by default).
 */
import bcrypt from 'bcryptjs'
import type { TeacherAssignment } from '@prisma/client'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { deleteGroupsAndDependents } from './cleanup'
import { isLocalDatabaseUrl } from './db-guard'
import type { StudentData, TeacherData } from './phase3'

const HASH_ROUNDS = 4
const PASSWORD_ALPHABET = 'abcdefghkmnpqrstuvwxyz23456789'

let counter = 0
const uniqSuffix = () =>
  `${Date.now().toString(36)}${(++counter).toString(36)}`.slice(-10)

function generatePassword(length = 8): string {
  let pw = ''
  for (let i = 0; i < length; i++) {
    pw += PASSWORD_ALPHABET.charAt(
      Math.floor(Math.random() * PASSWORD_ALPHABET.length),
    )
  }
  return pw
}

/** Direct-Prisma equivalent of `phase3.ts:createTeacher` — shape matches. */
export async function seedTeacher(
  t: TeacherData,
): Promise<{ teacherId: string; password: string }> {
  const password = generatePassword()
  const passwordHash = await bcrypt.hash(password, HASH_ROUNDS)
  const user = await db.user.create({
    data: {
      email: t.email,
      username: t.email.split('@')[0]!.slice(0, 50),
      firstName: t.firstName,
      lastName: t.lastName,
      phone: t.phone,
      passwordHash,
      role: 'TEACHER',
      city: 'SPLIT',
    },
  })
  return { teacherId: user.id, password }
}

/**
 * Give `userId` a known password, straight in the database — what the setup
 * link would do, minus the mail. E2E needs a login; nothing in the app hands
 * one out any more (2026-09-29).
 */
export async function grantLogin(userId: string): Promise<string> {
  const password = generatePassword(10)
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, HASH_ROUNDS) },
  })
  return password
}

/**
 * The address a fixture child's parent signs in with: the fixture's own
 * address with a unique `+tag`. Fixtures share parent e-mails across specs, and
 * one shared address would be ONE parent login seeing every such child — the
 * login would land on the child picker instead of the portal.
 */
export function uniqueParentEmail(base: string): string {
  const [local, domain] = base.split('@')
  return `${local}+${uniqSuffix()}@${domain}`.toLowerCase()
}

/**
 * A working parent login for `studentId`: the parent account the child is
 * already linked to (the admin UI links it on creation), or a new one on the
 * child's own parent e-mail. Returns what `loginWithEmail` takes.
 */
export async function grantParentLogin(
  studentId: string,
): Promise<{ loginEmail: string; password: string }> {
  const child = await db.user.findUniqueOrThrow({
    where: { id: studentId },
    select: { parentEmail: true, city: true, parentAccount: { select: { id: true, email: true } } },
  })
  let account = child.parentAccount
  if (!account) {
    if (!child.parentEmail) throw new Error(`grantParentLogin: ${studentId} has no parent e-mail`)
    account = await db.user.create({
      data: {
        email: child.parentEmail.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(generatePassword(), HASH_ROUNDS),
        firstName: 'Roditelj',
        lastName: 'E2E',
        role: 'PARENT',
        city: child.city,
      },
      select: { id: true, email: true },
    })
    await db.user.update({ where: { id: studentId }, data: { parentAccountId: account.id } })
  }
  return { loginEmail: account.email, password: await grantLogin(account.id) }
}

/** Direct-Prisma equivalent of `phase3.ts:assignTeacherToGroup`. */
export async function seedTeacherAssignment(
  teacherId: string,
  scheduledGroupId: string,
): Promise<TeacherAssignment> {
  return db.teacherAssignment.create({
    data: { userId: teacherId, scheduledGroupId },
  })
}

/**
 * Direct-Prisma equivalent of `phase3.ts:createStudentInGroup` — creates a
 * STUDENT user + Enrollment row in one shot, plus the child's own parent login
 * (a unique `+tag` address, see {@link uniqueParentEmail}) with a known
 * password. `loginEmail` + `password` is what the family signs in with.
 */
export async function seedStudentInGroup(
  groupId: string,
  s: StudentData,
): Promise<{
  studentId: string
  loginEmail: string
  password: string
}> {
  // A child never signs in; this hash only fills the column.
  const passwordHash = await bcrypt.hash(generatePassword(24), HASH_ROUNDS)
  const suffix = uniqSuffix()
  const base = `${s.firstName}.${s.lastName}`
    .toLowerCase()
    .replaceAll(/[čć]/g, 'c')
    .replaceAll('š', 's')
    .replaceAll('ž', 'z')
    .replaceAll('đ', 'd')
    .replaceAll(/[^a-z0-9.]/g, '.')
    .replaceAll(/\.{2,}/g, '.')
    .replaceAll(/(?:^\.|\.$)/g, '')
  const username = `${base}.${suffix}`.slice(0, 50)
  const email = `${username}@student.inovatic.local`

  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: { schoolYear: true, courseId: true, city: true },
  })
  if (!group) throw new Error(`seedStudentInGroup: group ${groupId} not found`)

  // Mirror the admin UI ("Kreiraj učenika" defaults to "Svi moduli"): enroll
  // the student in every ModuleSchedule for the group's course + school year.
  // Without this, the per-module attendance filter would hide the student.
  const moduleSchedules = await db.moduleSchedule.findMany({
    where: {
      schoolYear: group.schoolYear,
      module: { courseId: group.courseId },
    },
    select: { id: true },
  })

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        username,
        firstName: s.firstName,
        lastName: s.lastName,
        dateOfBirth: s.dateOfBirth,
        childSchool: s.childSchool,
        parentName: s.parentName,
        parentEmail: uniqueParentEmail(s.parentEmail),
        parentPhone: s.parentPhone,
        passwordHash,
        role: 'STUDENT',
        city: group.city,
      },
    })
    const enrollment = await tx.enrollment.create({
      data: {
        userId: user.id,
        scheduledGroupId: groupId,
        schoolYear: group.schoolYear,
      },
    })
    for (const ms of moduleSchedules) {
      await tx.moduleEnrollment.create({
        data: { enrollmentId: enrollment.id, moduleScheduleId: ms.id },
      })
    }
    return user
  })

  return { studentId: result.id, ...(await grantParentLogin(result.id)) }
}


/**
 * Clear test students out of the phase3 fixture groups.
 *
 * `createStudentInGroup` and `seedStudentInGroup` enrol into the same two
 * bootstrap groups and never clean up, so the groups fill over successive runs
 * until the capacity guard disables their radio. Every spec whose `beforeAll`
 * seeds a student then fails with "element is not enabled", reported against
 * whatever test owned that hook — which reads as an unrelated bug.
 *
 * Called from `20-bootstrap.spec.ts`, so a full phase3 run always starts from
 * an empty fixture group regardless of how many runs preceded it.
 *
 * Deliberately narrow: only STUDENT rows enrolled in the given groups. Deletes
 * in FK order — Attendance and the assessment/comment tables are RESTRICT.
 */
export async function clearFixtureGroupEnrollments(groupIds: string[]): Promise<number> {
  if (groupIds.length === 0) return 0

  const enrollments = await db.enrollment.findMany({
    where: { scheduledGroupId: { in: groupIds }, user: { role: 'STUDENT' } },
    select: { id: true, userId: true },
  })
  if (enrollments.length === 0) return 0

  const enrollmentIds = enrollments.map((e) => e.id)
  const userIds = [...new Set(enrollments.map((e) => e.userId))]

  await db.attendance.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } })
  await db.moduleEnrollment.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } })
  await db.studentComment.deleteMany({ where: { studentId: { in: userIds } } })
  await db.studentAssessment.deleteMany({ where: { studentId: { in: userIds } } })
  await db.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } })

  // Only remove students left with no enrolment anywhere — a child seeded into
  // another group by a different spec must survive.
  const orphaned = await db.user.findMany({
    where: { id: { in: userIds }, role: 'STUDENT', enrollments: { none: {} } },
    select: { id: true },
  })
  if (orphaned.length > 0) {
    const parentIds = (
      await db.user.findMany({
        where: { id: { in: orphaned.map((u) => u.id) }, parentAccountId: { not: null } },
        select: { parentAccountId: true },
      })
    ).map((u) => u.parentAccountId as string)
    await db.user.deleteMany({ where: { id: { in: orphaned.map((u) => u.id) } } })
    // Their parent logins go too once no child is left on them — only PARENT
    // rows, never a staff account a fixture happened to link to.
    await db.passwordToken.deleteMany({ where: { userId: { in: parentIds } } })
    await db.user.deleteMany({
      where: { id: { in: parentIds }, role: 'PARENT', children: { none: {} } },
    })
  }
  return enrollments.length
}

/**
 * A bookable `ScheduledGroup` on the shared natjecateljski program, named with
 * the caller's run id so the ordinary teardown removes it.
 *
 * Exists because the competition signup spec had no group to sign up to.
 * `seedCompetitionProgram` seeds the course and its natjecanja but deliberately
 * no groups — those are admin-created — and `loadPrograms` builds its course map
 * from the groups query, so a program with none never enters it and
 * `/prijava/natjecateljski-program` renders "Upisi trenutno nisu otvoreni". The
 * spec then failed on a missing Step-1 field, which reads like a broken form
 * rather than absent fixture data. Seeding it here is what makes the spec
 * self-sufficient instead of dependent on whatever happens to be in the dev
 * database.
 *
 * Returns null when the program is not seeded at all (`npm run db:seed:competition`
 * never run) — the caller can then skip rather than fail on unrelated setup.
 */
export async function seedCompetitionGroup(
  runId: string,
  city: 'SPLIT' | 'SIBENIK' = 'SPLIT',
): Promise<{ id: string; courseId: string } | null> {
  const course = await db.course.findUnique({
    where: { slug: 'natjecateljski-program' },
    select: { id: true },
  })
  if (!course) return null

  const location = await db.location.findFirst({
    where: { city },
    select: { id: true },
  })
  if (!location) return null

  const schoolYear = computeSchoolYear()

  // The window is what `loadPrograms` gates on; the season is what gives the
  // group its sessions. Both are upserted wide open, because a dev fixture wants
  // "this is bookable now", not a faithful reproduction of a real season.
  await db.courseEnrollmentWindow.upsert({
    where: { courseId_schoolYear_city: { courseId: course.id, schoolYear, city } },
    create: {
      courseId: course.id,
      schoolYear,
      city,
      enrollmentStart: new Date('2020-01-01'),
      enrollmentEnd: new Date('2099-12-31'),
    },
    update: {
      enrollmentStart: new Date('2020-01-01'),
      enrollmentEnd: new Date('2099-12-31'),
    },
  })
  await db.courseSeason.upsert({
    where: { courseId_schoolYear_city: { courseId: course.id, schoolYear, city } },
    create: {
      courseId: course.id,
      schoolYear,
      city,
      startDate: new Date('2020-01-01'),
      endDate: new Date('2099-12-31'),
    },
    update: { startDate: new Date('2020-01-01'), endDate: new Date('2099-12-31') },
  })

  const group = await db.scheduledGroup.create({
    data: {
      name: `Test Natjecatelji ${runId}`,
      courseId: course.id,
      locationId: location.id,
      city,
      schoolYear,
      dayOfWeek: 'Subota',
      startTime: '09:00',
      endTime: '10:30',
      maxStudents: 20,
    },
    select: { id: true },
  })
  return { id: group.id, courseId: course.id }
}

/**
 * Remove the bootstrap pair left by PREVIOUS runs, before this one creates its own.
 *
 * `20-bootstrap` names its two groups `Test Grupa A` / `Test Grupa B` — fixed,
 * because downstream specs find them by name — so it cannot stamp a run id and
 * `cleanupRunFixtures` has nothing to match on. The result was a fresh pair on
 * every run, stacked on top of the last, with the fixture file pointing only at
 * the newest: invisible, and the single largest source of the `/admin/grupe`
 * lane packing this whole teardown effort exists to stop.
 *
 * Called at the START of bootstrap rather than the end of the suite, because the
 * groups have to outlive the run that made them — every phase3 spec enrols into
 * them.
 *
 * Refuses a non-local DATABASE_URL: unlike everything `cleanupRunFixtures`
 * touches, this deletes by LITERAL NAME — no run id scopes it — and the
 * dependents chain includes `TeacherAttendance` payout rows. A shell whose env
 * points at a real database must not be one Playwright invocation away from
 * that. `E2E_ALLOW_REMOTE_DB=1` is the escape hatch for a CI test DB that is
 * genuinely not on localhost (the `--force` of `refresh-dev-dates`).
 */
export async function dropPreviousBootstrapGroups(names: string[]): Promise<number> {
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL) && process.env.E2E_ALLOW_REMOTE_DB !== '1') {
    throw new Error(
      'dropPreviousBootstrapGroups: DATABASE_URL does not look local. This helper deletes ' +
        'groups BY NAME, including their TeacherAttendance payout rows — refusing. Set ' +
        'E2E_ALLOW_REMOTE_DB=1 only for a dedicated remote test database.',
    )
  }
  const groups = await db.scheduledGroup.findMany({
    where: { name: { in: names } },
    select: { id: true },
  })
  await deleteGroupsAndDependents(groups.map((g) => g.id))
  return groups.length
}
