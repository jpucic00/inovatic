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
      plainPassword: password,
      role: 'TEACHER',
    },
  })
  return { teacherId: user.id, password }
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
 * STUDENT user + Enrollment row in one shot. `username` is derived from
 * firstName.lastName + a unique suffix to avoid colliding with siblings
 * across test runs; `email` is set to `${username}@student.inovatic.local`
 * (the same shape the admin UI generates) so `loginWithEmail` works
 * unchanged.
 */
export async function seedStudentInGroup(
  groupId: string,
  s: StudentData,
): Promise<{
  studentId: string
  username: string
  password: string
}> {
  const password = generatePassword()
  const passwordHash = await bcrypt.hash(password, HASH_ROUNDS)
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
    select: { schoolYear: true },
  })
  if (!group) throw new Error(`seedStudentInGroup: group ${groupId} not found`)

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
        parentEmail: s.parentEmail,
        parentPhone: s.parentPhone,
        passwordHash,
        plainPassword: password,
        role: 'STUDENT',
      },
    })
    await tx.enrollment.create({
      data: {
        userId: user.id,
        scheduledGroupId: groupId,
        schoolYear: group.schoolYear,
      },
    })
    return user
  })

  return { studentId: result.id, username, password }
}

