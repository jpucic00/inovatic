'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { assertInquiryInCity } from '@/lib/city-guard'
import { InquiryStatus, InquiryType, type City, type Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import {
  declineInquirySchema,
  schedulePartySchema,
  waitlistInquirySchema,
  type SchedulePartyInput,
  type WaitlistInquiryInput,
} from '@/lib/validators/admin/inquiry'
import {
  loadWaitlistGroupViews,
  loadWaitlistPositions,
  type WaitlistGroupView,
} from '@/lib/waitlist'
import type { AdminActionResult, PaginatedResult } from '@/lib/action-types'
import { sendScheduleOptionsEmail } from '@/lib/email'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { computeGroupCapacity, RESERVING_INQUIRY_WHERE } from '@/lib/group-capacity'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { formatGroupSchedule } from '@/lib/format'
import type { Grade } from '@/lib/inquiry-status'
import { candidateWheres, isIdentityMatch } from '@/lib/student-match'
import { flagReturningInquiries } from '@/lib/returning-inquiry'
import type { ReturningFilter } from '@/lib/returning-filter'
import { isRadionica } from '@/lib/program-kind'
import { unaccentSearchFilter } from '@/lib/unaccent-search'

type InquiryFilters = {
  status?: InquiryStatus | 'ALL'
  search?: string
  courseId?: string
  grade?: Grade
  type?: InquiryType | 'ALL'
  returning?: ReturningFilter
  /** WAITLIST narrows to the lista čekanja, in queue order (oldest first). */
  view?: 'ALL' | 'WAITLIST'
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
  /** Lista čekanja view only — see enrichWaitlistRows. */
  waitlist?: {
    position: number | null
    groups: WaitlistGroupView[]
    hasFreeSpot: boolean
  }
}

/**
 * Ids of the inquiries matching `where` that fall on the wanted side of the
 * "Ponovni upis" marker.
 *
 * The marker is not a column — it comes out of an identity lookup run over a
 * page of rows (`flagReturningInquiries`), so it cannot be pushed into the
 * `where` without writing the two-tier matching rule a second time in SQL. That
 * rule lives in `src/lib/student-match.ts` precisely so the dedup-on-create path
 * and the display marker can never drift; a third copy for one filter would be
 * the drift. So the whole (year + city + current filters) set is flagged once
 * and the survivors narrow the real, paginated query — `total` and the page
 * slice then agree, which they would not if the table filtered after paging.
 *
 * PARTY rows carry no child and so are never returning; they are dropped from
 * BOTH directions rather than falling into "Novi upis", where a birthday party
 * would be counted as somebody's first enrollment. An admin who has also picked
 * Vrsta: Proslave therefore gets an empty table, which is the honest answer —
 * silently overriding their choice would be worse.
 */
async function returningInquiryIds(
  where: Prisma.InquiryWhereInput,
  want: ReturningFilter,
): Promise<string[]> {
  const candidates = await db.inquiry.findMany({
    where,
    select: {
      id: true,
      type: true,
      childFirstName: true,
      childLastName: true,
      childDateOfBirth: true,
      parentEmail: true,
      studentId: true,
      city: true,
    },
  })
  const flagged = await flagReturningInquiries(candidates)
  return flagged
    .filter(
      (r) =>
        r.type === InquiryType.COURSE &&
        r.isReturning === (want === 'RETURNING'),
    )
    .map((r) => r.id)
}

export async function getInquiries(
  filters: InquiryFilters = {},
): Promise<PaginatedResult<InquiryListRow>> {
  const { city } = await requireAdminCtx()

  const { status, search, courseId, grade, type, returning, view, page = 1, pageSize = 20 } = filters
  const isWaitlistView = view === 'WAITLIST'
  const schoolYear = await getSelectedSchoolYear()
  // Parent name, child name and parent e-mail, matched case- AND
  // accent-insensitively so "Testic" finds "Testić" — see unaccent-search.ts.
  const searchFilter = await unaccentSearchFilter('Inquiry', search)

  const where: Prisma.InquiryWhereInput = {
    schoolYear,
    city,
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(type && type !== 'ALL' ? { type } : {}),
    ...(courseIdFilter(courseId)),
    ...(grade ? { childGrade: grade } : {}),
    ...(isWaitlistView ? { waitlistedAt: { not: null } } : {}),
    ...searchFilter,
  }

  // AND-composed rather than spread: the search filter already claims `id`, and
  // spreading a second one would silently drop whichever came first.
  const scopedWhere: Prisma.InquiryWhereInput = returning
    ? { AND: [where, { id: { in: await returningInquiryIds(where, returning) } }] }
    : where

  const [data, total] = await Promise.all([
    db.inquiry.findMany({
      where: scopedWhere,
      orderBy: isWaitlistView
        ? [{ waitlistedAt: 'asc' }, { id: 'asc' }]
        : { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inquiry.count({ where: scopedWhere }),
  ])

  const flagged = await flagReturningInquiries(data)
  const enriched = isWaitlistView
    ? await enrichWaitlistRows(flagged, city, schoolYear)
    : flagged
  return { data: enriched, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }
}

/**
 * Attaches each waitlisted row's queue position and its acceptable groups with
 * live free-seat counts. One group query for the whole page, never per row.
 * A group's count excludes nobody's reservation here: a waitlisted upit holds
 * no seat anyway (RESERVING_INQUIRY_WHERE).
 */
async function enrichWaitlistRows<T extends { id: string }>(
  rows: T[],
  city: City,
  schoolYear: string,
): Promise<(T & { waitlist: NonNullable<InquiryListRow['waitlist']> })[]> {
  const links = await db.inquiryWaitlistGroup.findMany({
    where: { inquiryId: { in: rows.map((r) => r.id) } },
    select: { inquiryId: true, scheduledGroupId: true },
  })
  const groupIds = [...new Set(links.map((l) => l.scheduledGroupId))]
  const [groups, positions] = await Promise.all([
    groupIds.length > 0
      ? loadWaitlistGroupViews({ id: { in: groupIds }, city })
      : Promise.resolve([]),
    loadWaitlistPositions(city, schoolYear),
  ])
  const byId = new Map(groups.map((g) => [g.id, g]))

  return rows.map((row) => {
    const own = links
      .filter((l) => l.inquiryId === row.id)
      .map((l) => byId.get(l.scheduledGroupId))
      .filter((g): g is WaitlistGroupView => Boolean(g))
    return {
      ...row,
      waitlist: {
        position: positions.get(row.id) ?? null,
        groups: own,
        hasFreeSpot: own.some((g) => !g.isFull),
      },
    }
  })
}

/** Tab counts for /admin/upiti — both scoped to the sidebar year and the city. */
export async function getInquiryTabCounts(): Promise<{ all: number; waitlist: number }> {
  const { city } = await requireAdminCtx()
  const schoolYear = await getSelectedSchoolYear()
  const [all, waitlist] = await Promise.all([
    db.inquiry.count({ where: { city, schoolYear } }),
    db.inquiry.count({ where: { city, schoolYear, waitlistedAt: { not: null } } }),
  ])
  return { all, waitlist }
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
  parentEmail?: string | null
  excludeStudentId?: string | null
}): Promise<ReturningStudentInfo | null> {
  const { city } = await requireAdminCtx()

  // Strict tier (name + DOB) plus the legacy tier for DOB-less imported
  // accounts (name + parent email) — one candidate query, the name decided in
  // memory by the shared key, strict preferred below.
  const wheres = candidateWheres(input)
  if (wheres.length === 0) return null

  const students = await db.user.findMany({
    where: { OR: wheres },
    select: {
      id: true,
      city: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      parentEmail: true,
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

  const candidates = students.filter(
    (s) => s.id !== input.excludeStudentId && isIdentityMatch(s, input),
  )
  if (candidates.length === 0) return null
  // The same identity can exist in both cities — prefer the own-city record
  // (full behavior) and only fall back to the masked flag when every match
  // lives in the other city. Among own-city records a strict (DOB-bearing)
  // match outranks a legacy DOB-less one.
  const ownCity = candidates.filter((s) => s.city === city)
  const student = ownCity.find((s) => s.dateOfBirth !== null) ?? ownCity[0]
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
        { OR: [{ kind: { not: 'RADIONICA' } }, { schoolYear: year }] },
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
          // Whether this program offers the payment choice at all — the
          // difference between "never asked" (radionica, natjecateljski) and
          // "asked but unanswered", which the detail page must not collapse.
          kind: true,
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
    // Declining settles the upit the same way creating the account does, so it
    // also takes it off the lista čekanja — in the same transaction, so a
    // declined family never lingers in the queue.
    await db.$transaction([
      db.inquiryWaitlistGroup.deleteMany({ where: { inquiryId: parsed.data.id } }),
      db.inquiry.update({
        where: { id: parsed.data.id },
        data: {
          status: 'DECLINED',
          declineReason: parsed.data.reason,
          waitlistedAt: null,
          waitlistNote: null,
        },
      }),
    ])
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

export async function getGroupsForCourse(courseId: string, excludeInquiryId?: string) {
  const { city } = await requireAdminCtx()
  const year = await getSelectedSchoolYear()

  if (!courseId) return []

  // The inquiry being processed must not block its own conversion: its NEW
  // reservation is the very seat createStudentFromInquiry frees before its
  // capacity assert, so the counts feeding the upit dialogs exclude it — and
  // the group holding that seat is flagged, because a publicly full group
  // showing one free spot here reads as a bug unless the UI says whose seat
  // it is. Only a NEW inquiry reserves a spot, so only a NEW one has a seat
  // to flag; a cross-city id is inert (it cannot prefer an own-city group).
  let reservedGroupId: string | null = null
  if (excludeInquiryId) {
    const excluded = await db.inquiry.findUnique({
      where: { id: excludeInquiryId },
      select: { status: true, scheduledGroupId: true, waitlistedAt: true },
    })
    // A waitlisted upit has released its seat, so there is nothing to flag.
    if (excluded?.status === 'NEW' && !excluded.waitlistedAt) {
      reservedGroupId = excluded.scheduledGroupId
    }
  }

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
          kind: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: year, city },
                select: { id: true, schoolYear: true, city: true, startDate: true, endDate: true },
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
            where: excludeInquiryId
              ? { ...RESERVING_INQUIRY_WHERE, id: { not: excludeInquiryId } }
              : RESERVING_INQUIRY_WHERE,
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const holidayDates = await loadHolidayDateKeys(year, city)
  return groups.map((g) => {
    const { availableSpots, isFull } = computeGroupCapacity(g, holidayDates, now)
    return { ...g, availableSpots, isFull, reservedByThisInquiry: g.id === reservedGroupId }
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
          kind: true,
          modules: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              sortOrder: true,
              schedules: {
                where: { schoolYear: year, city },
                select: { id: true, schoolYear: true, city: true, startDate: true, endDate: true },
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
            where: RESERVING_INQUIRY_WHERE,
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const holidayDates = await loadHolidayDateKeys(year, city)
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
      include: { location: true, course: { select: { kind: true } } },
    })
    if (groups.length !== new Set(groupIds).size) {
      return { success: false, error: 'Nevaljani podaci.' }
    }

    const options = groups.map((g) => ({
      groupName: g.name ?? 'Grupa',
      schedule: formatGroupSchedule({
        dateRange: isRadionica(g.course.kind),
        dayOfWeek: g.dayOfWeek,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        startTime: g.startTime,
        endTime: g.endTime,
      }),
      locationName: g.location.name,
      locationAddress: g.location.address,
    }))

    const childName = `${inquiry.childFirstName} ${inquiry.childLastName}`.trim()

    await sendScheduleOptionsEmail({
      to: inquiry.parentEmail,
      city: inquiry.city,
      parentName: inquiry.parentName,
      childName,
      options,
    })
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

// ---------------------------------------------------------------------------
// Lista čekanja — orthogonal to status (see the Inquiry.waitlistedAt comment).
// ---------------------------------------------------------------------------

/**
 * Groups a family could wait for: the given program's groups in the upit's own
 * city and school year, with live free-seat counts. Keyed on the UPIT's year,
 * not the sidebar cookie — a waitlist entry belongs to the year the family
 * signed up for, whatever year the admin happens to be looking at.
 */
export async function getWaitlistGroupOptions(
  inquiryId: string,
  courseId: string,
): Promise<WaitlistGroupView[]> {
  const { city } = await requireAdminCtx()
  if (!inquiryId || !courseId) return []

  const inquiry = await db.inquiry.findFirst({
    where: { id: inquiryId, city },
    select: { schoolYear: true },
  })
  if (!inquiry) return []
  const schoolYear = inquiry.schoolYear ?? (await getSelectedSchoolYear())

  return loadWaitlistGroupViews({ courseId, city, schoolYear }, inquiryId)
}

/** The upit's waitlist entry with live availability, or null when not on the list. */
export async function getInquiryWaitlist(inquiryId: string) {
  const { city } = await requireAdminCtx()

  const inquiry = await db.inquiry.findFirst({
    where: { id: inquiryId, city },
    select: {
      schoolYear: true,
      waitlistedAt: true,
      waitlistNote: true,
      waitlistGroups: { select: { scheduledGroupId: true } },
    },
  })
  if (!inquiry?.waitlistedAt) return null

  const groupIds = inquiry.waitlistGroups.map((g) => g.scheduledGroupId)
  const [groups, positions] = await Promise.all([
    groupIds.length > 0
      ? loadWaitlistGroupViews({ id: { in: groupIds }, city }, inquiryId)
      : Promise.resolve([]),
    loadWaitlistPositions(city, inquiry.schoolYear),
  ])

  return {
    waitlistedAt: inquiry.waitlistedAt,
    note: inquiry.waitlistNote,
    position: positions.get(inquiryId) ?? null,
    groups,
  }
}

/**
 * Puts a COURSE upit on the lista čekanja, or edits its entry. Any status is
 * allowed — that is the point of the list. `waitlistedAt` is stamped only on
 * the way ON, so editing the groups or note never costs the family its place
 * in the queue.
 */
export async function setInquiryWaitlist(
  input: WaitlistInquiryInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = waitlistInquirySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const { id, groupIds, note } = parsed.data

  // Outside the try so the notFound() throw isn't swallowed.
  await assertInquiryInCity(id, city)

  const inquiry = await db.inquiry.findUnique({
    where: { id },
    select: { type: true, schoolYear: true, waitlistedAt: true },
  })
  if (!inquiry) return { success: false, error: 'Upit nije pronađen.' }
  if (inquiry.type !== InquiryType.COURSE) {
    return { success: false, error: 'Proslave se ne stavljaju na listu čekanja.' }
  }

  if (groupIds.length > 0) {
    const groups = await db.scheduledGroup.findMany({
      where: { id: { in: groupIds } },
      select: { city: true, schoolYear: true, courseId: true },
    })
    const valid =
      groups.length === groupIds.length &&
      groups.every(
        (g) =>
          g.city === city &&
          (inquiry.schoolYear === null || g.schoolYear === inquiry.schoolYear),
      ) &&
      new Set(groups.map((g) => g.courseId)).size === 1
    if (!valid) {
      return {
        success: false,
        error: 'Grupe moraju biti iz istog programa, grada i školske godine kao upit.',
      }
    }
  }

  try {
    await db.$transaction([
      db.inquiryWaitlistGroup.deleteMany({ where: { inquiryId: id } }),
      db.inquiry.update({
        where: { id },
        data: {
          waitlistNote: note,
          ...(inquiry.waitlistedAt ? {} : { waitlistedAt: new Date() }),
          waitlistGroups: {
            create: groupIds.map((scheduledGroupId) => ({ scheduledGroupId })),
          },
        },
      }),
    ])
  } catch (err) {
    console.error('setInquiryWaitlist failed:', err)
    return { success: false, error: 'Greška pri spremanju liste čekanja.' }
  }

  revalidatePath('/admin/upiti')
  revalidatePath(`/admin/upiti/${id}`)
  return { success: true }
}

const WAITLIST_NEW_REMOVAL_ERROR =
  'Novi upit se ne može maknuti s liste čekanja. Najprije kreirajte račun ili odbijte upit.'

export async function removeInquiryFromWaitlist(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()
  if (!id) return { success: false, error: 'ID nije pronađen.' }

  await assertInquiryInCity(id, city)

  try {
    // A NEW upit may not leave the list: off it, it would take its form group's
    // seat straight back, and that group may have filled while the family
    // waited. It is resolved first — the account (which clears the entry) or a
    // decline — so leaving the list can never move a capacity count. The
    // status is re-checked inside the write, not only read beforehand.
    const removed = await db.$transaction(async (tx) => {
      const cleared = await tx.inquiry.updateMany({
        where: { id, status: { not: 'NEW' } },
        data: { waitlistedAt: null, waitlistNote: null },
      })
      if (cleared.count === 0) return false
      await tx.inquiryWaitlistGroup.deleteMany({ where: { inquiryId: id } })
      return true
    })
    if (!removed) return { success: false, error: WAITLIST_NEW_REMOVAL_ERROR }
  } catch (err) {
    console.error('removeInquiryFromWaitlist failed:', err)
    return { success: false, error: 'Greška pri uklanjanju s liste čekanja.' }
  }

  revalidatePath('/admin/upiti')
  revalidatePath(`/admin/upiti/${id}`)
  return { success: true }
}
