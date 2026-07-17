/**
 * Dev-only seed: populates an archived 2024/2025 school year so the developer
 * can browse the archived-year UI without waiting for current data to age out.
 *
 * Additive on top of `prisma/seed.ts` — reuses the locations + SLR 1–3 courses
 * that main seed creates. Idempotent: every demo user has the `py2425.` email
 * prefix and every year-scoped row is tagged `schoolYear: '2024/2025'`, so a
 * re-run cleans only its own slice first.
 *
 * Run: `npm run db:seed:previous-year` (after `npm run db:seed` once).
 */

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { computeExpectedSessions } from '../src/lib/session-dates'

const prisma = new PrismaClient()

const SCHOOL_YEAR = '2024/2025'
const EMAIL_PREFIX = 'py2425.'
const SHARED_PASSWORD = 'demo123'

const FIRST_NAMES = [
  'Luka', 'Mateo', 'Filip', 'Ivan', 'Marko', 'Tonči', 'Roko',
  'Petra', 'Mia', 'Eva', 'Lana', 'Sara', 'Tena', 'Nika',
  'Tin', 'Borna', 'Karla', 'Lea', 'Ema', 'Dora',
]
const LAST_NAMES = [
  'Babić', 'Kovač', 'Tomić', 'Knežević', 'Marković', 'Bošnjak', 'Šimić',
  'Pavić', 'Vukić', 'Grgić', 'Lukić', 'Bilić', 'Galić', 'Jukić',
  'Matić', 'Perić', 'Radić', 'Šarić', 'Vidović', 'Zorić',
]

const TEACHERS = [
  { firstName: 'Ivana', lastName: 'Marić' },
  { firstName: 'Petar', lastName: 'Kovačević' },
  { firstName: 'Ana',   lastName: 'Babić' },
]

const ABSENCE_NOTES = [
  'Bolest',
  'Obiteljski razlog',
  'Putovanje',
  'Neopravdano izostao/la',
  null,
]

const COMMENT_BODIES = [
  'Aktivan/na na satu, dobro surađuje s ostalim polaznicima.',
  'Pokazuje napredak u programiranju.',
  'Treba više vježbati na sklapanju konstrukcija.',
]

const MODULE_REVIEW_BODIES = [
  'Modul uspješno završen, ocjena: izvrstan.',
  'Modul završen, ocjena: vrlo dobar — dobar napredak.',
  'Modul završen uz dodatnu podršku.',
]

const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const MODULE_WINDOWS = [
  { startDate: utcDate('2024-09-02'), endDate: utcDate('2024-11-22') },
  { startDate: utcDate('2024-12-02'), endDate: utcDate('2025-02-21') },
  { startDate: utcDate('2025-03-03'), endDate: utcDate('2025-05-30') },
]

const ENROLLMENT_START = utcDate('2024-06-01')
const ENROLLMENT_END = utcDate('2024-08-31')

type GroupSpec = {
  key: 'g1' | 'g2' | 'g3'
  courseSlug: 'slr-1' | 'slr-2' | 'slr-3'
  locationName: string
  dayOfWeek: string
  startTime: string
  endTime: string
  groupName: string
  studentBirthYear: number
}

const GROUP_SPECS: GroupSpec[] = [
  { key: 'g1', courseSlug: 'slr-1', locationName: 'Velebitska 32',         dayOfWeek: 'Ponedjeljak', startTime: '16:00', endTime: '17:30', groupName: 'SLR 1 — Ponedjeljak 16:00 (2024/2025)', studentBirthYear: 2017 },
  { key: 'g2', courseSlug: 'slr-2', locationName: 'Velebitska 32',         dayOfWeek: 'Utorak',      startTime: '17:00', endTime: '18:30', groupName: 'SLR 2 — Utorak 17:00 (2024/2025)',      studentBirthYear: 2015 },
  { key: 'g3', courseSlug: 'slr-3', locationName: 'Ruđera Boškovića 33',   dayOfWeek: 'Srijeda',     startTime: '17:00', endTime: '18:30', groupName: 'SLR 3 — Srijeda 17:00 (2024/2025)',    studentBirthYear: 2013 },
]

// 20 students distributed 7 / 7 / 6 across the three groups
const STUDENT_GROUP_IDX = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]

async function checkPrerequisites() {
  const [velebitska, boskovica, slr1, slr2, slr3] = await Promise.all([
    prisma.location.findFirst({ where: { name: 'Velebitska 32' } }),
    prisma.location.findFirst({ where: { name: 'Ruđera Boškovića 33' } }),
    prisma.course.findUnique({ where: { slug: 'slr-1' }, include: { modules: { orderBy: { sortOrder: 'asc' } } } }),
    prisma.course.findUnique({ where: { slug: 'slr-2' }, include: { modules: { orderBy: { sortOrder: 'asc' } } } }),
    prisma.course.findUnique({ where: { slug: 'slr-3' }, include: { modules: { orderBy: { sortOrder: 'asc' } } } }),
  ])

  const missing: string[] = []
  if (!velebitska) missing.push('Location "Velebitska 32"')
  if (!boskovica) missing.push('Location "Ruđera Boškovića 33"')
  if (!slr1 || slr1.modules.length < 3) missing.push('Course slr-1 with ≥3 modules')
  if (!slr2 || slr2.modules.length < 3) missing.push('Course slr-2 with ≥3 modules')
  if (!slr3 || slr3.modules.length < 3) missing.push('Course slr-3 with ≥3 modules')

  if (missing.length > 0) {
    console.error('❌ Missing prerequisites:')
    for (const m of missing) console.error(`   - ${m}`)
    console.error('\nRun `npm run db:seed` first to populate baseline data.')
    process.exit(1)
  }

  return {
    locations: { 'Velebitska 32': velebitska!, 'Ruđera Boškovića 33': boskovica! },
    courses: { 'slr-1': slr1!, 'slr-2': slr2!, 'slr-3': slr3! },
  }
}

async function cleanup() {
  await prisma.attendance.deleteMany({ where: { enrollment: { schoolYear: SCHOOL_YEAR } } })
  await prisma.studentComment.deleteMany({ where: { group: { schoolYear: SCHOOL_YEAR } } })
  await prisma.studentAssessment.deleteMany({ where: { group: { schoolYear: SCHOOL_YEAR } } })
  await prisma.moduleEnrollment.deleteMany({ where: { enrollment: { schoolYear: SCHOOL_YEAR } } })
  await prisma.enrollment.deleteMany({ where: { schoolYear: SCHOOL_YEAR } })
  await prisma.teacherAssignment.deleteMany({ where: { scheduledGroup: { schoolYear: SCHOOL_YEAR } } })
  await prisma.scheduledGroup.deleteMany({ where: { schoolYear: SCHOOL_YEAR } })
  await prisma.moduleSchedule.deleteMany({ where: { schoolYear: SCHOOL_YEAR } })
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
}

async function main() {
  console.log(`🌱 Seeding archived ${SCHOOL_YEAR} school year...`)

  const prereqs = await checkPrerequisites()
  console.log('✅ Prerequisites OK (locations + SLR 1–3 with modules)')

  await cleanup()
  console.log('🗑️  Cleaned previous demo data for this school year')

  await prisma.schoolYear.upsert({
    where: { label: SCHOOL_YEAR },
    update: {},
    create: { label: SCHOOL_YEAR },
  })
  console.log(`✅ SchoolYear "${SCHOOL_YEAR}" upserted`)

  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 4)

  // ── Teachers ──────────────────────────────────────────────────────────────
  const teachers = await Promise.all(
    TEACHERS.map((t, i) =>
      prisma.user.create({
        data: {
          city: 'SPLIT',
          email: `${EMAIL_PREFIX}teacher.${i + 1}@inovatic-demo.local`,
          passwordHash,
          firstName: t.firstName,
          lastName: t.lastName,
          role: UserRole.TEACHER,
          phone: `+385 91 000 0${String(i + 1).padStart(2, '0')}`,
        },
      })
    )
  )
  console.log(`✅ ${teachers.length} teachers created`)

  // ── Groups + ModuleSchedules + TeacherAssignments ─────────────────────────
  type CreatedGroup = {
    spec: GroupSpec
    groupId: string
    teacherId: string
    moduleSchedules: { id: string; moduleId: string }[]
  }
  const createdGroups: CreatedGroup[] = []

  // Signup window now lives per (course, school year), not per group. Open one
  // window per distinct program used this year so the seeded groups inherit it.
  const distinctCourseIds = Array.from(
    new Set(GROUP_SPECS.map((s) => prereqs.courses[s.courseSlug].id)),
  )
  await prisma.courseEnrollmentWindow.createMany({
    data: distinctCourseIds.map((courseId) => ({
      city: 'SPLIT',
      courseId,
      schoolYear: SCHOOL_YEAR,
      enrollmentStart: ENROLLMENT_START,
      enrollmentEnd: ENROLLMENT_END,
    })),
    skipDuplicates: true,
  })

  for (let i = 0; i < GROUP_SPECS.length; i++) {
    const spec = GROUP_SPECS[i]
    const course = prereqs.courses[spec.courseSlug]
    const location = prereqs.locations[spec.locationName as keyof typeof prereqs.locations]
    const teacher = teachers[i]

    const group = await prisma.scheduledGroup.create({
      data: {
        city: 'SPLIT',
        courseId: course.id,
        locationId: location.id,
        name: spec.groupName,
        dayOfWeek: spec.dayOfWeek,
        startTime: spec.startTime,
        endTime: spec.endTime,
        schoolYear: SCHOOL_YEAR,
        maxStudents: 12,
      },
    })

    await prisma.teacherAssignment.create({
      data: { userId: teacher.id, scheduledGroupId: group.id },
    })

    const moduleSchedules: { id: string; moduleId: string }[] = []
    for (let m = 0; m < MODULE_WINDOWS.length; m++) {
      const courseModule = course.modules[m]
      const win = MODULE_WINDOWS[m]
      const ms = await prisma.moduleSchedule.create({
        data: {
          city: 'SPLIT',
          moduleId: courseModule.id,
          schoolYear: SCHOOL_YEAR,
          startDate: win.startDate,
          endDate: win.endDate,
        },
      })
      moduleSchedules.push({ id: ms.id, moduleId: courseModule.id })
    }

    createdGroups.push({ spec, groupId: group.id, teacherId: teacher.id, moduleSchedules })
  }
  console.log(`✅ ${createdGroups.length} ScheduledGroups + ${createdGroups.length * MODULE_WINDOWS.length} ModuleSchedules + TeacherAssignments created`)

  // ── Students + Enrollments + ModuleEnrollments ────────────────────────────
  type EnrolledStudent = {
    studentId: string
    studentIdx: number
    groupSpec: GroupSpec
    enrollmentId: string
    teacherId: string
    moduleSchedules: { id: string; moduleId: string }[]
  }
  const enrolled: EnrolledStudent[] = []

  for (let n = 0; n < STUDENT_GROUP_IDX.length; n++) {
    const groupIdx = STUDENT_GROUP_IDX[n]
    const g = createdGroups[groupIdx]
    const firstName = FIRST_NAMES[n]
    const lastName = LAST_NAMES[n]
    const dobDay = ((n * 3) % 27) + 1
    const dobMonth = ((n * 5) % 12) + 1
    const dobYear = g.spec.studentBirthYear
    const dob = `${String(dobDay).padStart(2, '0')}.${String(dobMonth).padStart(2, '0')}.${dobYear}.`
    const phoneSuffix = String(n + 1).padStart(2, '0')

    const student = await prisma.user.create({
      data: {
        city: 'SPLIT',
        email: `${EMAIL_PREFIX}student.${n + 1}@inovatic-demo.local`,
        passwordHash,
        firstName,
        lastName,
        role: UserRole.STUDENT,
        phone: `+385 92 000 00${phoneSuffix}`,
        dateOfBirth: dob,
        parentName: `Roditelj ${firstName}a`,
        parentEmail: `parent.${EMAIL_PREFIX}${n + 1}@inovatic-demo.local`,
        parentPhone: `+385 99 000 00${phoneSuffix}`,
      },
    })

    const enrollment = await prisma.enrollment.create({
      data: {
        userId: student.id,
        scheduledGroupId: g.groupId,
        schoolYear: SCHOOL_YEAR,
      },
    })

    await prisma.moduleEnrollment.createMany({
      data: g.moduleSchedules.map((ms) => ({
        enrollmentId: enrollment.id,
        moduleScheduleId: ms.id,
      })),
    })

    enrolled.push({
      studentId: student.id,
      studentIdx: n,
      groupSpec: g.spec,
      enrollmentId: enrollment.id,
      teacherId: g.teacherId,
      moduleSchedules: g.moduleSchedules,
    })
  }
  console.log(`✅ ${enrolled.length} students + enrollments + module enrollments created`)

  // ── Attendance ────────────────────────────────────────────────────────────
  let attendanceCount = 0
  for (const g of createdGroups) {
    const sessions = computeExpectedSessions({
      dayOfWeek: g.spec.dayOfWeek,
      moduleWindows: MODULE_WINDOWS.map((w) => ({ startDate: w.startDate, endDate: w.endDate })),
    })

    const groupEnrollments = enrolled.filter((e) => e.groupSpec.key === g.spec.key)

    for (const e of groupEnrollments) {
      const absenceOffset = e.studentIdx % 7
      const rows = sessions.map((sessionDate, i) => {
        const isAbsent = i % 7 === absenceOffset
        const note = isAbsent
          ? ABSENCE_NOTES[(e.studentIdx + Math.floor(i / 7)) % ABSENCE_NOTES.length]
          : null
        return {
          enrollmentId: e.enrollmentId,
          sessionDate,
          present: !isAbsent,
          note,
          recordedById: g.teacherId,
        }
      })
      const result = await prisma.attendance.createMany({ data: rows, skipDuplicates: true })
      attendanceCount += result.count
    }
  }
  console.log(`✅ ${attendanceCount} attendance rows created (~85% present)`)

  // ── Comments + report cards ───────────────────────────────────────────────
  let commentCount = 0
  let assessmentCount = 0
  for (const g of createdGroups) {
    const groupEnrollments = enrolled.filter((e) => e.groupSpec.key === g.spec.key)
    const sample = groupEnrollments.slice(0, 6)

    for (let i = 0; i < sample.length; i++) {
      const e = sample[i]
      await prisma.studentComment.create({
        data: {
          studentId: e.studentId,
          groupId: g.groupId,
          authorId: g.teacherId,
          content: COMMENT_BODIES[i % COMMENT_BODIES.length],
        },
      })
      commentCount++

      // A structured report card for the second half of the sample.
      if (i >= 3) {
        await prisma.studentAssessment.create({
          data: {
            studentId: e.studentId,
            groupId: g.groupId,
            authorId: g.teacherId,
            slaganje: 'OSTVARENO',
            programiranje: 'U_RAZVOJU',
            inovacije: 'OSTVARENO',
            suradnja: 'OSTVARENO',
            komunikacija: 'U_RAZVOJU',
            zabava: 'OSTVARENO',
            opisnaOcjena: MODULE_REVIEW_BODIES[(i - 3) % MODULE_REVIEW_BODIES.length],
          },
        })
        assessmentCount++
      }
    }
  }
  console.log(
    `✅ ${commentCount} student comments + ${assessmentCount} report cards created`,
  )

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('')
  console.log(`🎉 Previous-year seed complete!`)
  console.log('')
  console.log(`   Shared password: ${SHARED_PASSWORD}`)
  console.log(`   Teacher login:   ${EMAIL_PREFIX}teacher.1@inovatic-demo.local  → /nastavnik`)
  console.log(`   Student login:   ${EMAIL_PREFIX}student.1@inovatic-demo.local  → /portal`)
  console.log(`   Admin view:      http://localhost:3000/admin/grupe  (switch year to ${SCHOOL_YEAR})`)
  console.log('')
  console.log(`   Re-run idempotently with: npm run db:seed:previous-year`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
