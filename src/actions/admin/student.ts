'use server'

import type { City, PaymentOption, Prisma, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertUserInCity } from '@/lib/city-guard'
import { buildStudentDetailForAdmin } from '@/lib/student-detail'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import type { AdminActionResult, PaginatedResult } from '@/lib/action-types'
import {
  createStudentSchema,
  createStudentManuallySchema,
  updateStudentSchema,
  addEnrollmentSchema,
  type CreateStudentManuallyInput,
  type UpdateStudentInput,
  type AddEnrollmentInput,
} from '@/lib/validators/admin/student'
import { hashPassword, generateSimplePassword } from '@/lib/password'
import {
  GroupFullError,
  assertGroupHasAvailableSpot,
  runWithGroupCapacityGuard,
} from '@/lib/group-capacity'
import { archivedYearError, archivedGroupError } from '@/lib/school-year-guard'
import { legacyIdentityWhere, studentIdentityWhere } from '@/lib/student-match'
import { computeSchoolYear } from '@/lib/school-year'
import { isMonthlyBilled } from '@/lib/program-kind'
import { offersPaymentOption } from '@/lib/payment-option'
import { unaccentSearchFilter } from '@/lib/unaccent-search'
import { seasonMonths } from '@/lib/monthly-charges'
import {
  computeStudentPaymentStatus,
  paymentStatusUserWhere,
  type PaymentStatus,
  type PaymentFilter,
} from '@/lib/payment-status'
import {
  isReturningStudent,
  returningStudentWhere,
  type ReturningFilter,
} from '@/lib/returning-filter'

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

const GROUP_FULL_ERROR = 'Grupa je u međuvremenu popunjena.'

// Named errors thrown inside the createStudentFromInquiry transaction to
// short-circuit + roll back. The catch block maps each to its localized
// action-result message via `instanceof`, so the Croatian copy lives only at
// that boundary — not string-matched across throw + catch sites (which used to
// silently demote to the generic error on any copy edit). Mirrors the
// GroupFullError pattern in src/lib/group-capacity.ts. Local (not exported):
// 'use server' modules may only export async functions, and every throw +
// catch site is in this file.
class InquiryNotFoundError extends Error {
  constructor() {
    super('Inquiry not found')
  }
}

class InquiryAlreadyProcessedError extends Error {
  constructor() {
    super('Inquiry already processed')
  }
}

class InquiryDeclinedError extends Error {
  constructor() {
    super('Inquiry declined')
  }
}

class GroupNotFoundError extends Error {
  constructor() {
    super('Group not found')
  }
}

class GroupCityMismatchError extends Error {
  constructor() {
    super('Group city mismatch')
  }
}

// Identity matching (name + DOB) is intentionally GLOBAL across cities
// (owner decision 2026-07-10), but a cross-city match must never be silently
// reused — the admin gets an escalation error instead of the other city's
// account (and never its credentials).
class CrossCityStudentError extends Error {
  constructor() {
    super('Student exists in the other city')
  }
}

export type StudentRow = {
  id: string
  firstName: string
  lastName: string
  username: string | null
  dateOfBirth: string | null
  createdAt: Date
  /** Resolved against the result's `returningYear`, not against today's date. */
  paymentStatus: PaymentStatus
  /** Enrolled in the result's `returningYear` and in some year before it. */
  isReturning: boolean
  enrollments: {
    id: string
    schoolYear: string
    fullYearPaidAt: Date | null
    scheduledGroup: {
      id: string
      name: string | null
      dayOfWeek: string | null
      startTime: string | null
      course: { id: string; title: string; kind: ProgramKind }
      location: { name: string }
    }
    moduleEnrollments: {
      id: string
      paidAt: Date | null
      moduleSchedule: { startDate: Date | null }
    }[]
  }[]
}

/**
 * The list plus the school year it was resolved against — the year that flagged
 * `isReturning`, decided each `paymentStatus`, and (when `schoolYear` was given)
 * narrowed the rows. The page renders it in the column header, so nothing here
 * can be read against a year it does not name.
 */
type StudentListResult = PaginatedResult<StudentRow> & {
  returningYear: string
}

type CreateStudentResult =
  | {
      success: true
      username: string
      password: string
      isExisting: boolean
      studentId: string
      // No `emailFailed`: since 2026-08-17 neither creation path mails anything.
      // Credentials leave only through the CREDENTIALS e-mail campaign, so there
      // is no send here that could fail.
    }
  | { success: false; error: string; code?: 'GROUP_FULL' }

// No `emailSent` counterpart to the teacher result — a student password reset
// is never mailed (see resetStudentPassword).
type ResetStudentPasswordResult =
  | { success: true; password: string }
  | { success: false; error: string }

const DIACRITICS_MAP: Record<string, string> = {
  'č': 'c', 'ć': 'c', 'š': 's', 'ž': 'z', 'đ': 'd',
  'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Ž': 'Z', 'Đ': 'D',
}

function stripDiacritics(str: string): string {
  return str.replaceAll(/[čćšžđČĆŠŽĐ]/g, (ch) => DIACRITICS_MAP[ch] ?? ch)
}

async function generateUsername(
  tx: TxClient,
  firstName: string,
  lastName: string,
): Promise<string> {
  const base = stripDiacritics(`${firstName}${lastName}`)
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[^a-z0-9]/g, '')

  const existing = await tx.user.findUnique({ where: { username: base } })
  if (!existing) return base

  let suffix = 2
  while (true) {
    const candidate = `${base}${suffix}`
    const taken = await tx.user.findUnique({ where: { username: candidate } })
    if (!taken) return candidate
    suffix++
  }
}

type CoreInput = {
  /** Tenant city stamped on a new account and required of the target group. */
  city: City
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  parentName?: string | null
  parentEmail?: string | null
  parentPhone?: string | null
  childSchool?: string | null
  gdprConsentAt?: Date | null
  groupId?: string | null
  moduleScheduleIds?: string[]
  /**
   * The family's "Po modulu" / "Cijela školska godina" answer, carried over from
   * the upit so an admin does not re-type what the parent already told us. SLR
   * only — the upit stores null for every other kind.
   */
  paymentOption?: PaymentOption | null
}

type CoreResult = {
  user: { id: string; username: string | null }
  password: string
  isExisting: boolean
  enrollmentId: string | null
  group: {
    id: string
    name: string | null
    dayOfWeek: string | null
    dateStart: string | null
    dateEnd: string | null
    startTime: string | null
    endTime: string | null
    schoolYear: string
    course: { title: string; kind: ProgramKind }
    location: { name: string; address: string }
  } | null
}

function buildParentBackfill(input: CoreInput): Prisma.UserUpdateInput {
  const backfill: Prisma.UserUpdateInput = {}
  if (input.parentName) backfill.parentName = input.parentName
  if (input.parentEmail) backfill.parentEmail = input.parentEmail
  if (input.parentPhone) backfill.parentPhone = input.parentPhone
  if (input.childSchool) backfill.childSchool = input.childSchool
  if (input.gdprConsentAt) backfill.gdprConsentAt = input.gdprConsentAt
  return backfill
}

async function findOrCreateStudent(
  tx: TxClient,
  input: CoreInput,
): Promise<{ user: { id: string; username: string | null }; password: string; isExisting: boolean }> {
  const matchSelect = {
    id: true, username: true, plainPassword: true, city: true, dateOfBirth: true,
  } as const
  // Strict identity (name + DOB) wins; the legacy tier (name + parent email vs
  // DOB-less imported accounts) is only consulted when strict finds nothing.
  const strictWhere = studentIdentityWhere(input)
  const legacyWhere = legacyIdentityWhere(input)
  const existingStudent =
    (strictWhere
      ? await tx.user.findFirst({ where: strictWhere, select: matchSelect })
      : null) ??
    (legacyWhere
      ? await tx.user.findFirst({ where: legacyWhere, select: matchSelect })
      : null)

  if (existingStudent && existingStudent.city !== input.city) {
    throw new CrossCityStudentError()
  }

  if (existingStudent) {
    const backfill = buildParentBackfill(input)
    // Legacy-tier reuse: heal the missing DOB so this account matches the
    // strict rule from now on and stops being fuzzy-matchable.
    if (!existingStudent.dateOfBirth && input.dateOfBirth) {
      backfill.dateOfBirth = input.dateOfBirth
    }
    // A historically-imported account carries an unusable hash and no
    // `plainPassword` (src/lib/import-history/apply.ts). Re-enrolling one has
    // to mint real credentials here, or the parent's confirmation email ships
    // a blank Lozinka line and the child still cannot log in.
    const password = existingStudent.plainPassword ?? generateSimplePassword(6)
    if (!existingStudent.plainPassword) {
      backfill.plainPassword = password
      backfill.passwordHash = await hashPassword(password)
      // Rotating the password always invalidates anything a campaign mailed.
      // A no-op today (a null plainPassword means nothing was ever sendable),
      // written so the invariant stays local to the rotation rather than
      // depending on that coincidence holding.
      backfill.credentialsSentAt = null
    }
    if (Object.keys(backfill).length > 0) {
      await tx.user.update({
        where: { id: existingStudent.id },
        data: backfill,
      })
    }
    return {
      user: { id: existingStudent.id, username: existingStudent.username },
      password,
      isExisting: true,
    }
  }

  const username = await generateUsername(tx, input.firstName, input.lastName)
  const password = generateSimplePassword(6)
  const passwordHash = await hashPassword(password)

  const created = await tx.user.create({
    data: {
      email: `${username}@student.inovatic.local`,
      username,
      plainPassword: password,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth ?? null,
      role: 'STUDENT',
      parentName: input.parentName ?? null,
      parentEmail: input.parentEmail ?? null,
      parentPhone: input.parentPhone ?? null,
      childSchool: input.childSchool ?? null,
      gdprConsentAt: input.gdprConsentAt ?? null,
      city: input.city,
    },
    select: { id: true, username: true },
  })
  return { user: created, password, isExisting: false }
}

const ENSURE_ENROLLMENT_DEFAULT_OPTIONS = { assertCapacity: true } as const

async function ensureEnrollment(
  tx: TxClient,
  userId: string,
  groupId: string,
  moduleScheduleIds: string[] | undefined,
  city: City,
  paymentOption: PaymentOption | null | undefined,
  options: { assertCapacity: boolean } = ENSURE_ENROLLMENT_DEFAULT_OPTIONS,
): Promise<{ enrollmentId: string; group: CoreResult['group'] }> {
  const sg = await tx.scheduledGroup.findUnique({
    where: { id: groupId },
    include: {
      location: { select: { name: true, address: true } },
      course: { select: { title: true, kind: true } },
    },
  })
  if (!sg) throw new GroupNotFoundError()
  if (sg.city !== city) throw new GroupCityMismatchError()

  const existingEnrollment = await tx.enrollment.findUnique({
    where: {
      userId_scheduledGroupId_schoolYear: {
        userId,
        scheduledGroupId: sg.id,
        schoolYear: sg.schoolYear,
      },
    },
  })

  // Only assert capacity when we'd actually be claiming a new spot. An
  // existing Enrollment row means we're only adding ModuleEnrollment rows;
  // the student already occupies a seat in this (group, schoolYear).
  if (!existingEnrollment && options.assertCapacity) {
    await assertGroupHasAvailableSpot(tx, sg.id)
  }

  // The payment model is written on CREATE only. An existing row may already
  // carry a value an admin corrected on the student profile, and re-running this
  // (a second module added to the same group) must never quietly reinstate what
  // the parent guessed at sign-up time. Refused outright on a kind that offers no
  // choice, so a stale inquiry value cannot leak onto a radionica enrollment.
  const seededOption =
    paymentOption && offersPaymentOption(sg.course.kind) ? paymentOption : null

  const enrollmentId = existingEnrollment
    ? existingEnrollment.id
    : (await tx.enrollment.create({
        data: {
          userId,
          scheduledGroupId: sg.id,
          schoolYear: sg.schoolYear,
          paymentOption: seededOption,
        },
      })).id

  if (moduleScheduleIds && moduleScheduleIds.length > 0) {
    await tx.moduleEnrollment.createMany({
      data: moduleScheduleIds.map((moduleScheduleId) => ({
        enrollmentId,
        moduleScheduleId,
      })),
      skipDuplicates: true,
    })
  }

  if (isMonthlyBilled(sg.course.kind)) {
    await createSeasonMonths(tx, enrollmentId, sg.courseId, sg.schoolYear, city)
  }

  return { enrollmentId, group: sg }
}

/**
 * Write the payable months for a monthly-fee enrollment: every month from the
 * one the child is joining in through the end of the program's season.
 *
 * Deliberately floored at "now" rather than the season start — a child enrolled
 * in January owes January onwards, never the autumn they didn't attend.
 * `skipDuplicates` keeps re-running it (a second enrollment call on the same
 * group) a no-op. An unplanned season writes nothing; setting the dates later
 * backfills through `upsertCourseSeason`.
 */
async function createSeasonMonths(
  tx: TxClient,
  enrollmentId: string,
  courseId: string,
  schoolYear: string,
  city: City,
): Promise<void> {
  const season = await tx.courseSeason.findUnique({
    where: { courseId_schoolYear_city: { courseId, schoolYear, city } },
    select: { startDate: true, endDate: true },
  })
  if (!season) return

  const months = seasonMonths(season.startDate, season.endDate, new Date())
  if (months.length === 0) return

  await tx.enrollmentMonth.createMany({
    data: months.map((periodStart) => ({ enrollmentId, periodStart })),
    skipDuplicates: true,
  })
}

/**
 * Shared core for student creation (both inquiry-based and manual).
 * - Dedupes against existing students by firstName+lastName+dateOfBirth.
 * - When groupId is given, uses the target group's schoolYear (not
 *   computeSchoolYear()) so future-year enrollments work.
 * - Creates ModuleEnrollment rows when moduleScheduleIds is non-empty.
 * - Capacity is enforced by ensureEnrollment when a new Enrollment row would
 *   be created; callers running on top of an inquiry that itself reserves a
 *   spot on the same target group must free that reservation BEFORE invoking
 *   createStudentCore so the count doesn't double.
 */
async function createStudentCore(tx: TxClient, input: CoreInput): Promise<CoreResult> {
  const { user, password, isExisting } = await findOrCreateStudent(tx, input)

  if (!input.groupId) {
    return { user, password, isExisting, enrollmentId: null, group: null }
  }

  const { enrollmentId, group } = await ensureEnrollment(
    tx,
    user.id,
    input.groupId,
    input.moduleScheduleIds,
    input.city,
    input.paymentOption,
  )
  return { user, password, isExisting, enrollmentId, group }
}

/**
 * Translate the named errors thrown while creating a student (capacity guard,
 * inquiry-state guards, missing group) into their Croatian result. Returns null
 * for anything unrecognized so the caller logs it and surfaces a generic message.
 */
function mapStudentCreationError(err: unknown): CreateStudentResult | null {
  if (err instanceof GroupFullError) {
    return { success: false, error: GROUP_FULL_ERROR, code: 'GROUP_FULL' }
  }
  if (err instanceof InquiryNotFoundError) {
    return { success: false, error: 'Upit nije pronađen.' }
  }
  if (err instanceof InquiryAlreadyProcessedError) {
    return { success: false, error: 'Račun je već stvoren za ovaj upit.' }
  }
  if (err instanceof InquiryDeclinedError) {
    return { success: false, error: 'Upit je odbijen.' }
  }
  if (err instanceof GroupNotFoundError) {
    return { success: false, error: 'Grupa nije pronađena.' }
  }
  if (err instanceof GroupCityMismatchError) {
    return { success: false, error: 'Odabrana grupa je u drugom gradu.' }
  }
  if (err instanceof CrossCityStudentError) {
    return {
      success: false,
      error:
        'Dijete s ovim podacima već postoji u drugom gradu. Obratite se vlasniku udruge za ručno rješavanje.',
    }
  }
  return null
}

export async function createStudentFromInquiry(
  inquiryId: string,
  groupId: string,
  moduleScheduleIds?: string[],
): Promise<CreateStudentResult> {
  const { city } = await requireAdminCtx()

  const parsed = createStudentSchema.safeParse({ inquiryId, groupId })
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  // Pre-flight status check so we can return a clean error without spinning
  // up a transaction. The tx body re-checks under serializable isolation.
  // Cross-city inquiries read as nonexistent — this is a dialog-driven action,
  // so it keeps the error-result contract instead of throwing notFound().
  const inquiryPreview = await db.inquiry.findUnique({ where: { id: inquiryId } })
  if (inquiryPreview?.city !== city) {
    return { success: false, error: 'Upit nije pronađen.' }
  }
  if (inquiryPreview.status === 'ACCOUNT_CREATED') {
    return { success: false, error: 'Račun je već stvoren za ovaj upit.' }
  }
  if (inquiryPreview.status === 'DECLINED') {
    return { success: false, error: 'Upit je odbijen.' }
  }

  const archived = await archivedGroupError(groupId)
  if (archived) return archived

  let core: CoreResult
  try {
    const result = await runWithGroupCapacityGuard(async (tx) => {
      const fresh = await tx.inquiry.findUnique({ where: { id: inquiryId } })
      if (!fresh) throw new InquiryNotFoundError()
      if (fresh.status === 'ACCOUNT_CREATED') {
        throw new InquiryAlreadyProcessedError()
      }
      if (fresh.status === 'DECLINED') {
        throw new InquiryDeclinedError()
      }
      // Party inquiries carry no enrolling child and never reach this action
      // (the UI offers "Dogovori termin" instead). Guard defensively so the
      // child name fields narrow to non-null for createStudentCore below.
      if (fresh.type !== 'COURSE' || !fresh.childFirstName || !fresh.childLastName) {
        throw new Error('Cannot create a student account from a non-course inquiry.')
      }

      // Free this inquiry's reservation BEFORE the capacity assertion so the
      // count doesn't include the spot we're about to claim. Inquiry-mark
      // first; backfill studentId/assignedGroupId once we have them.
      await tx.inquiry.update({
        where: { id: inquiryId },
        data: { status: 'ACCOUNT_CREATED' },
      })

      const created = await createStudentCore(tx, {
        // The new account belongs to the inquiry's city (=== admin's city per
        // the pre-flight city check above); ensureEnrollment rejects a group
        // from the other city before any enrollment/backfill is written.
        city: fresh.city,
        firstName: fresh.childFirstName,
        lastName: fresh.childLastName,
        dateOfBirth: fresh.childDateOfBirth,
        parentName: fresh.parentName,
        parentEmail: fresh.parentEmail,
        parentPhone: fresh.parentPhone,
        childSchool: fresh.childSchool,
        gdprConsentAt: fresh.consentGivenAt,
        groupId,
        moduleScheduleIds,
        paymentOption: fresh.paymentOption,
      })

      if (!created.group) {
        throw new GroupNotFoundError()
      }

      await tx.inquiry.update({
        where: { id: inquiryId },
        data: { studentId: created.user.id, assignedGroupId: groupId },
      })

      return { core: created }
    })
    core = result.core
  } catch (err) {
    const mapped = mapStudentCreationError(err)
    if (mapped) return mapped
    console.error('createStudentFromInquiry failed:', err)
    return { success: false, error: 'Greška pri kreiranju računa.' }
  }

  if (!core.group) {
    return { success: false, error: 'Grupa nije pronađena.' }
  }

  // Accepting an inquiry deliberately mails NOTHING (2026-08-17). Credentials
  // leave the building only through the CREDENTIALS e-mail campaign, which the
  // admin runs once the contracts are signed — see `/admin/email`. The password
  // stays readable on the student profile, which is now the primary way to hand
  // it over early rather than a fallback.
  revalidatePath('/admin/upiti')
  // Creating this student may make OTHER inquiries with the same child identity
  // read as "Ponovni upis", so revalidate every inquiry detail page, not just
  // the one we processed.
  revalidatePath('/admin/upiti/[id]', 'page')
  revalidatePath('/admin/ucenici')

  return {
    success: true,
    username: core.user.username ?? '',
    password: core.password,
    isExisting: core.isExisting,
    studentId: core.user.id,
  }
}

export async function createStudentManually(
  input: CreateStudentManuallyInput,
): Promise<CreateStudentResult> {
  const { city } = await requireAdminCtx()

  const parsed = createStudentManuallySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const data = parsed.data

  if (data.groupId) {
    const archived = await archivedGroupError(data.groupId)
    if (archived) return archived
  }

  let core: CoreResult
  try {
    core = await runWithGroupCapacityGuard((tx) =>
      createStudentCore(tx, {
        city,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth ?? null,
        parentName: data.parentName ?? null,
        parentEmail: data.parentEmail,
        parentPhone: data.parentPhone ?? null,
        childSchool: data.childSchool ?? null,
        gdprConsentAt: null,
        groupId: data.groupId ?? null,
        moduleScheduleIds: data.moduleScheduleIds,
      }),
    )
  } catch (err) {
    // ensureEnrollment throws GroupNotFoundError when data.groupId points at a
    // missing group (normally shadowed by the archivedGroupError pre-flight, but
    // reachable if the group is deleted mid-tx); the shared mapper handles that
    // plus GroupFullError, falling through to the generic message otherwise.
    const mapped = mapStudentCreationError(err)
    if (mapped) return mapped
    console.error('createStudentManually failed:', err)
    return { success: false, error: 'Greška pri kreiranju učenika.' }
  }

  // Creating a student deliberately mails NOTHING (2026-08-17) — same rule as
  // inquiry acceptance. Credentials go out through the CREDENTIALS campaign.
  revalidatePath('/admin/ucenici')
  revalidatePath(`/admin/ucenici/${core.user.id}`)
  // A newly created student can flip matching inquiries to "Ponovni upis".
  revalidatePath('/admin/upiti')
  revalidatePath('/admin/upiti/[id]', 'page')

  return {
    success: true,
    username: core.user.username ?? '',
    password: core.password,
    isExisting: core.isExisting,
    studentId: core.user.id,
  }
}

/**
 * Admin-only edit of an existing student's child + parent data from the profile
 * page. City-scoped: a cross-city id resolves to notFound() (assertUserInCity),
 * indistinguishable from a nonexistent one. Optional text fields are trimmed;
 * empty → null so a cleared field wipes the stored value. Editing name/DOB can
 * change returning-student matching, so inquiry pages are revalidated too.
 */
export async function updateStudent(
  input: UpdateStudentInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = updateStudentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, firstName, lastName, dateOfBirth, childSchool, parentName, parentEmail, parentPhone } =
    parsed.data

  // Outside the try — the notFound() throw must not be swallowed by the catch.
  await assertUserInCity(id, city)

  try {
    const student = await db.user.findUnique({
      where: { id, role: 'STUDENT' },
      select: { id: true },
    })
    if (!student) return { success: false, error: 'Učenik nije pronađen.' }

    await db.user.update({
      where: { id },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth,
        childSchool: childSchool?.trim() || null,
        parentName: parentName?.trim() || null,
        // Required by the schema (and already trimmed there) — an edit can no
        // longer blank the credentials recipient / legacy-match key.
        parentEmail,
        parentPhone: parentPhone?.trim() || null,
      },
    })

    revalidatePath('/admin/ucenici')
    revalidatePath(`/admin/ucenici/${id}`)
    // Name/DOB edits can flip which inquiries read as "Ponovni upis".
    revalidatePath('/admin/upiti')
    revalidatePath('/admin/upiti/[id]', 'page')
    return { success: true }
  } catch (err) {
    console.error('updateStudent failed:', err)
    return { success: false, error: 'Greška pri ažuriranju učenika.' }
  }
}

export async function addEnrollment(
  input: AddEnrollmentInput,
): Promise<AdminActionResult & { enrollmentId?: string }> {
  const { city } = await requireAdminCtx()

  const parsed = addEnrollmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }
  const { studentId, groupId, moduleScheduleIds } = parsed.data

  // Lightweight pre-flight reads outside the tx for clean error mapping.
  // Cross-city rows answer exactly like nonexistent ones.
  const student = await db.user.findUnique({
    where: { id: studentId, role: 'STUDENT' },
    select: { id: true, city: true },
  })
  if (student?.city !== city) {
    return { success: false, error: 'Učenik nije pronađen.' }
  }

  const groupPreview = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: { id: true, schoolYear: true, city: true },
  })
  if (groupPreview?.city !== city) {
    return { success: false, error: 'Grupa nije pronađena.' }
  }

  const archived = archivedYearError(groupPreview.schoolYear)
  if (archived) return archived

  let enrollmentId: string
  try {
    enrollmentId = await runWithGroupCapacityGuard(async (tx) => {
      // No payment option here: an admin adding a group by hand has no upit
      // answer to carry over, and sets it on the card afterwards.
      const { enrollmentId: id } = await ensureEnrollment(
        tx,
        studentId,
        groupId,
        moduleScheduleIds,
        city,
        null,
      )
      return id
    })
  } catch (err) {
    if (err instanceof GroupFullError) {
      return { success: false, error: GROUP_FULL_ERROR, code: 'GROUP_FULL' }
    }
    console.error('addEnrollment failed:', err)
    return { success: false, error: 'Greška pri upisu u grupu.' }
  }

  revalidatePath(`/admin/ucenici/${studentId}`)
  return { success: true, enrollmentId }
}

/**
 * Hard-delete a module enrollment from the student detail view. The module
 * schedule then reappears in the "available to add" list. Used for admin
 * corrections — not the same as the group-view cancellation flow.
 */
export async function removeModuleEnrollment(
  moduleEnrollmentId: string,
  studentId: string,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!moduleEnrollmentId) return { success: false, error: 'ID nije pronađen.' }

  const row = await db.moduleEnrollment.findUnique({
    where: { id: moduleEnrollmentId },
    select: { enrollment: { select: { scheduledGroup: { select: { city: true } } } } },
  })
  if (row?.enrollment.scheduledGroup.city !== city) {
    return { success: false, error: 'Upis u modul nije pronađen.' }
  }

  try {
    await db.moduleEnrollment.delete({ where: { id: moduleEnrollmentId } })
  } catch (err) {
    console.error('removeModuleEnrollment failed:', err)
    return { success: false, error: 'Greška pri uklanjanju modula.' }
  }

  revalidatePath(`/admin/ucenici/${studentId}`)
  return { success: true }
}

type StudentFilters = {
  search?: string
  courseId?: string
  groupId?: string
  scheduleId?: string
  schoolYear?: string
  paymentStatus?: PaymentFilter
  returning?: ReturningFilter
  /**
   * Overrides the year that `isReturning` and the payment badge are resolved
   * against, for a caller that wants to ask about a year it is not narrowing to.
   * `/admin/ucenici` never passes it — it scopes to the sidebar year and lets
   * this fall through to `schoolYear`, so the list, the flags and the badges can
   * only ever name one year.
   *
   * The year is supplied by the caller rather than read from the cookie here:
   * `getSelectedSchoolYear()` needs a request context, and four integration
   * files call this action directly.
   */
  returningYear?: string
  page?: number
  pageSize?: number
}

export async function getStudents(
  filters: StudentFilters = {},
): Promise<StudentListResult> {
  const { city } = await requireAdminCtx()

  const { search, courseId, groupId, scheduleId, schoolYear, paymentStatus, returning, page = 1, pageSize = 20 } = filters

  const now = new Date()
  const currentYear = computeSchoolYear(now)

  // The one year this call reasons about: it flags "ponovni upis", it decides
  // whether a child's programme has started for the payment badge, and it is
  // echoed back so the column header names it. A badge reporting on a different
  // year than the one it prints is the single way this feature can lie.
  //
  // `computeSchoolYear(now)` is only the fallback for a caller that scopes to no
  // year at all. The page always passes `schoolYear`, and must: through the
  // summer, today's date still names the year that is ending while every upis
  // being made is for the one starting in September.
  const referenceYear = filters.returningYear || schoolYear || currentYear

  const andClauses: Prisma.UserWhereInput[] = []
  if (paymentStatus) andClauses.push(paymentStatusUserWhere(paymentStatus, referenceYear, now))
  if (returning) andClauses.push(returningStudentWhere(returning, referenceYear))

  // Name and username, matched case- AND accent-insensitively so "Testic" finds
  // "Testić" (see unaccent-search.ts), and per token so a full name — which
  // spans firstName and lastName — matches at all.
  const searchFilter = await unaccentSearchFilter('User', search)

  const where = {
    role: 'STUDENT' as const,
    city,
    ...searchFilter,
    ...(courseId || groupId || scheduleId || schoolYear
      ? {
          enrollments: {
            some: {
              ...(groupId ? { scheduledGroupId: groupId } : {}),
              ...(courseId ? { scheduledGroup: { courseId } } : {}),
              ...(scheduleId ? { moduleEnrollments: { some: { moduleScheduleId: scheduleId } } } : {}),
              ...(schoolYear ? { schoolYear } : {}),
            },
          },
        }
      : {}),
    // AND-wrapped so they do not collide with the `enrollments` key claimed by
    // the course/group/schedule filter spread above — nor with each other, since
    // the payment and ponovni-upis filters both narrow on enrollments.
    ...(andClauses.length > 0 ? { AND: andClauses } : {}),
  }

  const [data, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        dateOfBirth: true,
        createdAt: true,
        enrollments: {
          include: {
            scheduledGroup: {
              include: {
                course: { select: { id: true, title: true, kind: true } },
                location: { select: { name: true } },
              },
            },
            moduleEnrollments: {
              select: {
                id: true,
                paidAt: true,
                moduleSchedule: { select: { startDate: true } },
              },
            },
            enrollmentMonths: {
              select: { paidAt: true, periodStart: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ])

  const rows: StudentRow[] = data.map((u) => ({
    ...u,
    paymentStatus: computeStudentPaymentStatus(u.enrollments, referenceYear, now),
    isReturning: isReturningStudent(u.enrollments, referenceYear),
  })) as StudentRow[]

  return {
    data: rows,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
    returningYear: referenceYear,
  }
}

export async function getStudent(id: string) {
  const { city } = await requireAdminCtx()
  await assertUserInCity(id, city)
  return buildStudentDetailForAdmin(id, city)
}

/**
 * Regenerates a student's login password and reveals it to the admin.
 *
 * Display-only by design — nothing is emailed here: a child's `email` is the
 * synthetic @student.inovatic.local address, and credentials reach a parent only
 * through the CREDENTIALS e-mail campaign. The admin hands the new password over
 * directly, or runs that campaign.
 *
 * Clearing `credentialsSentAt` is the point of that column: any password a
 * previous campaign mailed no longer works, so the child must read as "not sent"
 * again rather than as a parent who already has working details.
 *
 * This is also one way to unlock a historically-imported account, which is
 * created with an unusable hash and no `plainPassword` — see the promise made in
 * src/lib/import-history/apply.ts. (The credentials campaign mints one too, for
 * every such child in its cohort.)
 */
export async function resetStudentPassword(
  studentId: string,
): Promise<ResetStudentPasswordResult> {
  const { city } = await requireAdminCtx()

  if (!studentId) return { success: false, error: 'ID nije pronađen.' }

  // Role-narrowed so a same-city TEACHER/ADMIN id can't be reset through the
  // student path. Wrong-role and cross-city ids both read as missing, matching
  // the city-guard notFound() convention used by deleteStudent.
  const target = await db.user.findFirst({
    where: { id: studentId, role: 'STUDENT' },
    select: { city: true },
  })
  if (target?.city !== city) notFound()

  try {
    const password = generateSimplePassword(6)
    const passwordHash = await hashPassword(password)

    await db.user.update({
      where: { id: studentId },
      data: { passwordHash, plainPassword: password, credentialsSentAt: null },
    })

    revalidatePath(`/admin/ucenici/${studentId}`)
    return { success: true, password }
  } catch (err) {
    console.error('resetStudentPassword failed:', err)
    return { success: false, error: 'Greška pri resetiranju lozinke.' }
  }
}

export async function deleteEnrollment(enrollmentId: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!enrollmentId) return { success: false, error: 'ID nije pronađen.' }

  try {
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true, scheduledGroup: { select: { city: true } } },
    })
    if (enrollment?.scheduledGroup.city !== city) {
      return { success: false, error: 'Upis nije pronađen.' }
    }

    await db.enrollment.delete({ where: { id: enrollmentId } })

    revalidatePath('/admin/ucenici')
    revalidatePath(`/admin/ucenici/${enrollment.userId}`)
    return { success: true }
  } catch (err) {
    console.error('deleteEnrollment failed:', err)
    return { success: false, error: 'Greška pri brisanju upisa.' }
  }
}

export async function deleteStudent(studentId: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!studentId) return { success: false, error: 'ID nije pronađen.' }

  // Hard-delete is for STUDENT rows only — a same-city TEACHER/ADMIN id must
  // not bypass deleteTeacher's soft-delete. Wrong-role and cross-city ids both
  // read as missing, matching the city-guard notFound() convention.
  const target = await db.user.findFirst({
    where: { id: studentId, role: 'STUDENT' },
    select: { city: true },
  })
  if (target?.city !== city) notFound()

  try {
    await db.$transaction(async (tx) => {
      await tx.inquiry.updateMany({
        where: { studentId },
        data: { studentId: null },
      })
      await tx.user.delete({ where: { id: studentId } })
    })

    revalidatePath('/admin/ucenici')
    // Removing the student drops the "Ponovni upis" match from any inquiry that
    // pointed at this child identity.
    revalidatePath('/admin/upiti')
    revalidatePath('/admin/upiti/[id]', 'page')
    return { success: true }
  } catch (err) {
    console.error('deleteStudent failed:', err)
    return { success: false, error: 'Greška pri brisanju učenika.' }
  }
}
