'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertInquiryInCity } from '@/lib/city-guard'
import { InquiryStatus, InquiryType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import {
  declineInquirySchema,
  schedulePartySchema,
  type SchedulePartyInput,
} from '@/lib/validators/admin/inquiry'
import type { AdminActionResult, PaginatedResult } from '@/lib/action-types'
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/email'
import { ScheduleOptionsEmail } from '../../../emails/schedule-options'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { computeGroupCapacity } from '@/lib/group-capacity'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { formatGroupSchedule } from '@/lib/format'
import type { Grade } from '@/lib/inquiry-status'
import { studentIdentityWhere } from '@/lib/student-match'
import { flagReturningInquiries } from '@/lib/returning-inquiry'

type InquiryFilters = {
  status?: InquiryStatus | 'ALL'
  search?: string
  courseId?: string
  grade?: Grade
  type?: InquiryType | 'ALL'
  page?: number
  pageSize?: number
}

function courseIdFilter(courseId: string | undefined) {
  if (courseId === 'NONE') return { courseId: null }
  if (courseId) return { courseId }
  return {}
}

type InquiryListRow = Awaited<ReturnType<typeof db.inquiry.findMany>>[number] & {
  isReturning: boolean
  isReturningOtherCity: boolean
}

export async function getInquiries(
  filters: InquiryFilters = {},
): Promise<PaginatedResult<InquiryListRow>> {
  const { city } = await requireAdminCtx()

  const { status, search, courseId, grade, type, page = 1, pageSize = 20 } = filters
  const schoolYear = await getSelectedSchoolYear()

  const where = {
    schoolYear,
    city,
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(type && type !== 'ALL' ? { type } : {}),
    ...(courseIdFilter(courseId)),
    ...(grade ? { childGrade: grade } : {}),
    ...(search
      ? {
          OR: [
            { parentName: { contains: search, mode: 'insensitive' as const } },
            { childFirstName: { contains: search, mode: 'insensitive' as const } },
            { childLastName: { contains: search, mode: 'insensitive' as const } },
            { parentEmail: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    db.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inquiry.count({ where }),
  ])

  const enriched = await flagReturningInquiries(data)
  return { data: enriched, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

type ReturningStudentInfo = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  history: {
    schoolYear: string
    groups: { courseTitle: string; groupName: string | null; locationName: string }[]
  }[]
}

// What a cross-city identity match is allowed to reveal: only that a matching
// child exists somewhere else. Same shape as a real match so the page renders
// it unchanged — empty id (no profile link works cross-city anyway), no DOB,
// no enrollment history, and the neutral label in the name slots.
const MASKED_CROSS_CITY_STUDENT: ReturningStudentInfo = {
  id: '',
  firstName: 'postojeći polaznik',
  lastName: '(druga lokacija)',
  dateOfBirth: null,
  history: [],
}

/**
 * Returns the existing student matching this inquiry's child identity (firstName
 * + lastName + dateOfBirth), with their enrollment history grouped by school
 * year (newest first), or `null` when there is no DOB, no match, or the only
 * match is the student this inquiry itself created (`excludeStudentId`).
 *
 * Identity matching is deliberately global across cities (owner decision), but
 * only a same-city match reveals details; a match living solely in the other
 * city collapses to the masked variant. The admin's session city stands in for
 * the inquiry's city here — the calling detail page already 404s cross-city
 * inquiries, so the two are always equal.
 */
export async function getReturningStudentInfo(input: {
  firstName: string
  lastName: string
  dateOfBirth?: string | null
  excludeStudentId?: string | null
}): Promise<ReturningStudentInfo | null> {
  const { city } = await requireAdminCtx()

  const where = studentIdentityWhere(input)
  if (!where) return null

  const students = await db.user.findMany({
    where,
    select: {
      id: true,
      city: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      enrollments: {
        select: {
          schoolYear: true,
          scheduledGroup: {
            select: {
              name: true,
              course: { select: { title: true } },
              location: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  const candidates = students.filter((s) => s.id !== input.excludeStudentId)
  if (candidates.length === 0) return null
  // The same identity can exist in both cities — prefer the own-city record
  // (full behavior) and only fall back to the masked flag when every match
  // lives in the other city.
  const student = candidates.find((s) => s.city === city)
  if (!student) return MASKED_CROSS_CITY_STUDENT

  const byYear = new Map<string, ReturningStudentInfo['history'][number]['groups']>()
  for (const e of student.enrollments) {
    const list = byYear.get(e.schoolYear) ?? []
    list.push({
      courseTitle: e.scheduledGroup.course.title,
      groupName: e.scheduledGroup.name,
      locationName: e.scheduledGroup.location.name,
    })
    byYear.set(e.schoolYear, list)
  }
  const history = [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([schoolYear, groups]) => ({ schoolYear, groups }))

  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: student.dateOfBirth,
    history,
  }
}

export async function getInquiryCourses() {
  const { city } = await requireAdminCtx()
  const year = await getSelectedSchoolYear()

  return db.course.findMany({
    // Mirror getCourses: standard courses are global; radionice are year-scoped,
    // so the Upiti program filter never lists other years' (always-empty) radionice.
    // City: shared standard programs (city null) plus own-city radionice — never
    // the other city's radionice.
    where: {
      AND: [
        { OR: [{ isCustom: false }, { schoolYear: year }] },
        { OR: [{ city: null }, { city }] },
      ],
    },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  })
}

export async function getInquiry(id: string) {
  const { city } = await requireAdminCtx()

  // findFirst so the city filter applies: a cross-city inquiry reads as null,
  // indistinguishable from a nonexistent one (the page notFound()s on null).
  return db.inquiry.findFirst({
    where: { id, city },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          level: true,
        },
      },
      scheduledGroup: { include: { location: true } },
      assignedGroup: {
        include: { course: true, location: true },
      },
    },
  })
}

export async function declineInquiry(
  id: string,
  reason: string,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = declineInquirySchema.safeParse({ id, reason })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }

  // Outside the try so the notFound() throw isn't swallowed.
  await assertInquiryInCity(parsed.data.id, city)

  try {
    await db.inquiry.update({
      where: { id: parsed.data.id },
      data: { status: 'DECLINED', declineReason: parsed.data.reason },
    })
  } catch (err) {
    console.error('declineInquiry failed:', err)
    return { success: false, error: 'Greška pri odbijanju upita.' }
  }

  revalidatePath('/admin/upiti')
  revalidatePath(`/admin/upiti/${id}`)
  return { success: true }
}

export async function deleteInquiry(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  await assertInquiryInCity(id, city)

  try {
    await db.inquiry.delete({ where: { id } })
  } catch (err) {
    console.error('deleteInquiry failed:', err)
    return { success: false, error: 'Greška pri brisanju upita.' }
  }

  revalidatePath('/admin/upiti')
  return { success: true }
}

export async function getGroupsForCourse(courseId: string) {
  const { city } = await requireAdminCtx()
  const year = await getSelectedSchoolYear()

  if (!courseId) return []

  // Session city == inquiry city for every inquiry-driven picker (cross-city
  // inquiries already read as nonexistent), so this offers only groups in the
  // inquiry's own city.
  const groups = await db.scheduledGroup.findMany({
    where: { courseId, schoolYear: year, city },
    include: {
      location: { select: { name: true } },
      course: {
        select: {
          title: true,
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: year },
                select: { id: true, schoolYear: true, startDate: true, endDate: true },
              },
            },
          },
        },
      },
      enrollments: {
        select: {
          id: true,
          moduleEnrollments: { select: { moduleScheduleId: true } },
        },
      },
      _count: {
        select: {
          preferredInquiries: {
            where: { status: 'NEW' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const holidayDates = await loadHolidayDateKeys(year)
  return groups.map((g) => {
    const { availableSpots, isFull } = computeGroupCapacity(g, holidayDates, now)
    return { ...g, availableSpots, isFull }
  })
}

/**
 * Returns groups for a course in the admin's currently-selected school year
 * (from the school-year switcher cookie). Used by the student detail
 * "add enrollment" and manual create dialogs. Each group's modules include
 * only the schedules for that same school year.
 */
export async function getGroupsForCourseInSelectedYear(courseId: string) {
  const { city } = await requireAdminCtx()
  if (!courseId) return []

  const year = await getSelectedSchoolYear()

  const groups = await db.scheduledGroup.findMany({
    where: { courseId, schoolYear: year, city },
    include: {
      location: { select: { name: true } },
      course: {
        select: {
          title: true,
          isCustom: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: year },
                select: { id: true, schoolYear: true, startDate: true, endDate: true },
              },
            },
          },
        },
      },
      enrollments: {
        select: {
          id: true,
          moduleEnrollments: { select: { moduleScheduleId: true } },
        },
      },
      _count: {
        select: {
          preferredInquiries: {
            where: { status: 'NEW' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const holidayDates = await loadHolidayDateKeys(year)
  return groups.map((g) => {
    const { availableSpots, isFull } = computeGroupCapacity(g, holidayDates, now)
    return { ...g, availableSpots, isFull }
  })
}

export async function sendScheduleOptions(
  inquiryId: string,
  groupIds: string[],
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!inquiryId || !groupIds.length) {
    return { success: false, error: 'Nevaljani podaci.' }
  }

  // Outside the try so the notFound() throw isn't swallowed.
  await assertInquiryInCity(inquiryId, city)

  try {
    const inquiry = await db.inquiry.findUnique({
      where: { id: inquiryId },
    })

    if (!inquiry) return { success: false, error: 'Upit nije pronađen.' }
    if (inquiry.status !== 'NEW') {
      return { success: false, error: 'Upit mora biti u statusu "Nova".' }
    }

    // Every offered group must live in the inquiry's own city — a missing or
    // cross-city id makes the whole send invalid.
    const groups = await db.scheduledGroup.findMany({
      where: { id: { in: groupIds }, city: inquiry.city },
      include: { location: true, course: { select: { isCustom: true } } },
    })
    if (groups.length !== new Set(groupIds).size) {
      return { success: false, error: 'Nevaljani podaci.' }
    }

    const options = groups.map((g) => ({
      groupName: g.name ?? 'Grupa',
      schedule: formatGroupSchedule({
        isCustom: g.course.isCustom,
        dayOfWeek: g.dayOfWeek,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        startTime: g.startTime,
        endTime: g.endTime,
      }),
      locationName: g.location.name,
    }))

    const childName = `${inquiry.childFirstName} ${inquiry.childLastName}`.trim()

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: inquiry.parentEmail,
        subject: `Dostupni termini za ${childName} – Inovatic`,
        react: ScheduleOptionsEmail({
          parentName: inquiry.parentName,
          childName,
          options,
        }),
      })
    }
  } catch (err) {
    console.error('sendScheduleOptions failed:', err)
    return { success: false, error: 'Greška pri slanju rasporeda.' }
  }

  revalidatePath('/admin/upiti')
  revalidatePath(`/admin/upiti/${inquiryId}`)
  return { success: true }
}

/**
 * Accept a PARTY inquiry by recording the agreed date + "HH:mm" start time.
 * Moves it to PARTY_SCHEDULED. The inquiry's `schoolYear` is intentionally left
 * unchanged so it stays in the admin's Upiti list (contact details remain
 * reachable after acceptance); the Kalendar finds it by its confirmed date
 * instead (see getScheduledParties). No email is sent.
 */
export async function schedulePartyInquiry(
  input: SchedulePartyInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = schedulePartySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const { id, confirmedDate, startTime } = parsed.data

  // Outside the try so the notFound() throw isn't swallowed.
  await assertInquiryInCity(id, city)

  try {
    const inquiry = await db.inquiry.findUnique({ where: { id }, select: { type: true } })
    if (!inquiry) return { success: false, error: 'Upit nije pronađen.' }
    if (inquiry.type !== 'PARTY') {
      return { success: false, error: 'Ovaj upit nije upit za proslavu.' }
    }

    const confirmed = new Date(`${confirmedDate}T00:00:00.000Z`)
    await db.inquiry.update({
      where: { id },
      data: {
        status: 'PARTY_SCHEDULED',
        partyConfirmedDate: confirmed,
        partyStartTime: startTime,
      },
    })
  } catch (err) {
    console.error('schedulePartyInquiry failed:', err)
    return { success: false, error: 'Greška pri dogovaranju termina.' }
  }

  revalidatePath('/admin/upiti')
  revalidatePath(`/admin/upiti/${id}`)
  revalidatePath('/admin/skolska-godina')
  return { success: true }
}

/**
 * Scheduled parties (type PARTY, status PARTY_SCHEDULED) whose CONFIRMED date
 * falls within the given school year (Sept 1 → next Sept 1) — the calendar feed
 * for `/admin/skolska-godina`. Keyed on the confirmed date, not the inquiry's
 * `schoolYear` field, so a party shows on the calendar of the year it's held in
 * regardless of which year's Upiti list the inquiry lives in.
 */
export async function getScheduledParties(schoolYear: string) {
  const { city } = await requireAdminCtx()

  const startYear = Number.parseInt(schoolYear.split('/')[0], 10)
  if (Number.isNaN(startYear)) return []
  const start = new Date(Date.UTC(startYear, 8, 1)) // Sept 1
  const end = new Date(Date.UTC(startYear + 1, 8, 1)) // next Sept 1 (exclusive)

  return db.inquiry.findMany({
    where: {
      type: 'PARTY',
      status: 'PARTY_SCHEDULED',
      city,
      partyConfirmedDate: { gte: start, lt: end },
    },
    select: {
      id: true,
      parentName: true,
      parentPhone: true,
      parentEmail: true,
      message: true,
      partyConfirmedDate: true,
      partyStartTime: true,
    },
    orderBy: { partyConfirmedDate: 'asc' },
  })
}
