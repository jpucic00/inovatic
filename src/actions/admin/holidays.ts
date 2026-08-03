'use server'

import { revalidatePath } from 'next/cache'
import type { City } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { archivedYearError } from '@/lib/school-year-guard'
import { fromDateKey, toDateKey } from '@/lib/session-dates'
import {
  bulkImportHolidaysSchema,
  removeHolidayRangeSchema,
  removeHolidaySchema,
  upsertHolidayRangeSchema,
  upsertHolidaySchema,
  type BulkImportHolidayItem,
  type BulkImportHolidaysInput,
  type RemoveHolidayInput,
  type RemoveHolidayRangeInput,
  type UpsertHolidayInput,
  type UpsertHolidayRangeInput,
} from '@/lib/validators/admin/holiday'
import type { AdminActionResult } from '@/lib/action-types'
import {
  fetchCroatianHolidays,
  HolidayApiError,
  type FetchedHoliday,
} from '@/lib/holiday-api'

/** Inclusive YYYY-MM-DD enumeration from start to end (UTC day arithmetic). */
function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const start = fromDateKey(startKey)
  const end = fromDateKey(endKey)
  const out: string[] = []
  const DAY_MS = 86_400_000
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    out.push(toDateKey(new Date(t)))
  }
  return out
}

/**
 * Marking a date as a holiday cancels the lesson, so BOTH attendance ledgers
 * have to go: the student rows and the `TeacherAttendance` rows that are the
 * sole basis for hourly payout. Counting or deleting only the student side
 * would leave the hour billable on `/admin/nastavnici/[id]` and understate the
 * cascade in the confirmation dialog.
 *
 * `TeacherAttendance` carries `scheduledGroupId` directly, so its filter is one
 * level shallower than the student one. The city filter is load-bearing in
 * both: a Šibenik closure must never touch Split rows.
 */
function attendanceScope(dateValues: Date[], schoolYear: string, city: City) {
  return {
    student: {
      sessionDate: { in: dateValues },
      enrollment: { scheduledGroup: { schoolYear, city } },
    },
    teacher: {
      sessionDate: { in: dateValues },
      scheduledGroup: { schoolYear, city },
    },
  }
}

/** Combined student + teacher rows the cascade would delete. */
async function countAffectedAttendance(
  client: Pick<typeof db, 'attendance' | 'teacherAttendance'>,
  dateValues: Date[],
  schoolYear: string,
  city: City,
): Promise<number> {
  const scope = attendanceScope(dateValues, schoolYear, city)
  const [students, teachers] = await Promise.all([
    client.attendance.count({ where: scope.student }),
    client.teacherAttendance.count({ where: scope.teacher }),
  ])
  return students + teachers
}

/** Irreversible — only ever called behind `confirmDeleteAttendance`. */
async function deleteAffectedAttendance(
  tx: Pick<typeof db, 'attendance' | 'teacherAttendance'>,
  dateValues: Date[],
  schoolYear: string,
  city: City,
): Promise<void> {
  const scope = attendanceScope(dateValues, schoolYear, city)
  await tx.attendance.deleteMany({ where: scope.student })
  await tx.teacherAttendance.deleteMany({ where: scope.teacher })
}

export type HolidayRow = {
  id: string
  schoolYear: string
  date: string // YYYY-MM-DD
  name: string | null
  createdAt: string // ISO
  createdBy: string | null
}

type UpsertHolidayResult =
  | { success: true; requiresConfirmation: false }
  | { success: true; requiresConfirmation: true; attendanceCount: number }
  | { success: false; error: string }

/** The caller's city's holidays for a school year, oldest first. */
export async function listHolidays(schoolYear: string): Promise<HolidayRow[]> {
  const { city } = await requireAdminCtx()
  const rows = await db.schoolYearHoliday.findMany({
    where: { schoolYear, city },
    orderBy: { date: 'asc' },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    schoolYear: r.schoolYear,
    date: toDateKey(r.date),
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : null,
  }))
}

/**
 * Upserts the holiday by (schoolYear, date). When attendance rows exist on
 * that date in the school year and `confirmDeleteAttendance` is not set, the
 * action returns `{ requiresConfirmation: true, attendanceCount }` without
 * touching the DB. With the flag, the records are deleted + the holiday is
 * inserted in a single transaction.
 */
export async function upsertHoliday(input: UpsertHolidayInput): Promise<UpsertHolidayResult> {
  const parsed = upsertHolidaySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const { date, ...rest } = parsed.data
  return upsertHolidayRange({ startDate: date, endDate: date, ...rest })
}

/**
 * Variant of `upsertHoliday` that marks every day in `[startDate, endDate]`
 * as a holiday in one transaction — for blocks like the whole Christmas
 * break. Confirmation reports the combined attendance count across the full
 * range so the admin sees the cascade impact in one number.
 */
export async function upsertHolidayRange(
  input: UpsertHolidayRangeInput,
): Promise<UpsertHolidayResult> {
  const { session, city } = await requireAdminCtx()

  const parsed = upsertHolidayRangeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const data = parsed.data

  const archived = archivedYearError(data.schoolYear)
  if (archived) return archived

  const dateKeys = enumerateDateKeys(data.startDate, data.endDate)
  const dateValues = dateKeys.map(fromDateKey)
  const name = data.name?.trim() ? data.name.trim() : null

  try {
    await db.$transaction(async (tx) => {
      if (data.confirmDeleteAttendance) {
        await deleteAffectedAttendance(tx, dateValues, data.schoolYear, city)
      } else {
        // Same transaction as the upserts below — mirrors bulkImportHolidays:
        // with a separate pre-check, an attendance row written in the gap
        // would be neither surfaced for confirmation nor deleted, stranding a
        // billed teaching hour behind the new holiday.
        const attendanceCount = await countAffectedAttendance(
          tx,
          dateValues,
          data.schoolYear,
          city,
        )
        if (attendanceCount > 0) {
          throw new AttendanceConfirmationRequired(attendanceCount, [])
        }
      }
      for (const dateUtc of dateValues) {
        await tx.schoolYearHoliday.upsert({
          where: { schoolYear_city_date: { schoolYear: data.schoolYear, city, date: dateUtc } },
          create: {
            schoolYear: data.schoolYear,
            city,
            date: dateUtc,
            name,
            createdById: session.user.id,
          },
          update: { name },
        })
      }
    })
  } catch (err) {
    if (err instanceof AttendanceConfirmationRequired) {
      return {
        success: true,
        requiresConfirmation: true,
        attendanceCount: err.attendanceCount,
      }
    }
    console.error('upsertHolidayRange failed:', err)
    return { success: false, error: 'Greška pri spremanju raspona praznika.' }
  }

  revalidatePath('/admin/skolska-godina')
  revalidatePath('/nastavnik', 'layout')
  return { success: true, requiresConfirmation: false }
}

/**
 * Bulk-remove every holiday in `[startDate, endDate]` for the school year —
 * pairs with `upsertHolidayRange` to let admins clear a whole break in one
 * click (e.g. drop the entire Christmas block). Single DELETE in a tx so
 * the operation is atomic.
 */
export async function removeHolidayRange(
  input: RemoveHolidayRangeInput,
): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = removeHolidayRangeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const data = parsed.data

  const archived = archivedYearError(data.schoolYear)
  if (archived) return archived

  try {
    await db.schoolYearHoliday.deleteMany({
      where: {
        schoolYear: data.schoolYear,
        city,
        date: { gte: fromDateKey(data.startDate), lte: fromDateKey(data.endDate) },
      },
    })
  } catch (err) {
    console.error('removeHolidayRange failed:', err)
    return { success: false, error: 'Greška pri brisanju raspona praznika.' }
  }

  revalidatePath('/admin/skolska-godina')
  revalidatePath('/nastavnik', 'layout')
  return { success: true }
}

export async function removeHoliday(input: RemoveHolidayInput): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const parsed = removeHolidaySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }

  const row = await db.schoolYearHoliday.findUnique({
    where: { id: parsed.data.id },
    select: { schoolYear: true, city: true },
  })
  // Cross-city rows answer exactly like nonexistent ones.
  if (row?.city !== city) {
    return { success: false, error: 'Praznik nije pronađen.' }
  }

  const archived = archivedYearError(row.schoolYear)
  if (archived) return archived

  try {
    await db.schoolYearHoliday.delete({ where: { id: parsed.data.id } })
  } catch (err) {
    console.error('removeHoliday failed:', err)
    return { success: false, error: 'Greška pri brisanju praznika.' }
  }

  revalidatePath('/admin/skolska-godina')
  revalidatePath('/nastavnik', 'layout')
  return { success: true }
}

// ────────────────────────────────────────────────────────────────────────────
// Bulk import from OpenHolidaysAPI (`/admin/skolska-godina` prefill dialog)
// ────────────────────────────────────────────────────────────────────────────

export type HolidayPreviewItem = FetchedHoliday & {
  existing: boolean
  attendanceCount: number
  dayCount: number
}

type PreviewHolidaysResult =
  | { success: true; items: HolidayPreviewItem[] }
  | { success: false; error: string }

/** All YYYY-MM-DD keys covered by a fetched item (inclusive). */
function datesForItem(item: FetchedHoliday | BulkImportHolidayItem): string[] {
  if (item.kind === 'single') return [item.date]
  return enumerateDateKeys(item.startDate, item.endDate)
}

/**
 * Fetch + annotate the holidays returned by OpenHolidaysAPI for the school
 * year. Adds `existing` (already in DB) and `attendanceCount` (rows whose
 * deletion the admin would have to confirm) so the dialog can present an
 * accurate preview without doing a second round-trip.
 */
export async function previewHolidaysFromApi(
  schoolYear: string,
): Promise<PreviewHolidaysResult> {
  const { city } = await requireAdminCtx()

  if (!/^\d{4}\/\d{4}$/.test(schoolYear)) {
    return { success: false, error: 'Nevažeća školska godina.' }
  }

  let fetched: FetchedHoliday[]
  try {
    fetched = await fetchCroatianHolidays(schoolYear)
  } catch (err) {
    console.error('previewHolidaysFromApi: fetch failed', err)
    const msg =
      err instanceof HolidayApiError
        ? err.message
        : 'Greška pri dohvaćanju praznika s OpenHolidaysAPI.'
    return { success: false, error: msg }
  }

  const allDates = new Set<string>()
  for (const item of fetched) {
    for (const d of datesForItem(item)) allDates.add(d)
  }
  const dateValues = Array.from(allDates).map(fromDateKey)

  const scope = attendanceScope(dateValues, schoolYear, city)
  const [existingRows, attendanceRows, teacherAttendanceRows] = await Promise.all([
    db.schoolYearHoliday.findMany({
      where: { schoolYear, city, date: { in: dateValues } },
      select: { date: true },
    }),
    db.attendance.findMany({ where: scope.student, select: { sessionDate: true } }),
    db.teacherAttendance.findMany({ where: scope.teacher, select: { sessionDate: true } }),
  ])

  const existingSet = new Set(existingRows.map((r) => toDateKey(r.date)))
  const attendanceCounts = new Map<string, number>()
  // Both ledgers, so the preview promises the same number the import deletes.
  for (const r of [...attendanceRows, ...teacherAttendanceRows]) {
    const k = toDateKey(r.sessionDate)
    attendanceCounts.set(k, (attendanceCounts.get(k) ?? 0) + 1)
  }

  const items: HolidayPreviewItem[] = fetched.map((f) => {
    const dates = datesForItem(f)
    const existing = dates.every((d) => existingSet.has(d))
    const attendanceCount = dates.reduce(
      (sum, d) => sum + (attendanceCounts.get(d) ?? 0),
      0,
    )
    return { ...f, existing, attendanceCount, dayCount: dates.length }
  })

  return { success: true, items }
}

type BulkImportHolidaysResult =
  | { success: true; requiresConfirmation: false; importedCount: number }
  | {
      success: true
      requiresConfirmation: true
      attendanceCount: number
      conflictDates: string[]
    }
  | { success: false; error: string }

/**
 * Thrown inside the bulk-import transaction when attendance exists on a
 * candidate date and the admin hasn't confirmed deletion. Aborting via throw
 * rolls the transaction back, so the confirmation is re-surfaced to the client
 * without leaving a partial import behind.
 */
class AttendanceConfirmationRequired extends Error {
  constructor(
    readonly attendanceCount: number,
    readonly conflictDates: string[],
  ) {
    super('ATTENDANCE_CONFIRMATION_REQUIRED')
    this.name = 'AttendanceConfirmationRequired'
  }
}

/**
 * Imports every selected holiday in ONE transaction. The attendance conflict
 * check and the holiday writes share that transaction, so the import is atomic
 * (a mid-batch failure rolls the whole batch back) and a freshly-created
 * attendance row can neither be silently skipped nor counted as imported
 * without being written. Overlapping selections (e.g. a public holiday inside a
 * school break) collapse to one row per date, the last-listed name winning.
 */
export async function bulkImportHolidays(
  input: BulkImportHolidaysInput,
): Promise<BulkImportHolidaysResult> {
  const { session, city } = await requireAdminCtx()

  const parsed = bulkImportHolidaysSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  const data = parsed.data

  const archived = archivedYearError(data.schoolYear)
  if (archived) return archived

  // Expand every selected item into the concrete holiday rows to write, keyed
  // by date so overlapping selections collapse to one row (last name wins).
  const dateToName = new Map<string, string | null>()
  for (const item of data.items) {
    const name = item.name.trim() ? item.name.trim() : null
    for (const dateKey of datesForItem(item)) dateToName.set(dateKey, name)
  }
  const dateValues = Array.from(dateToName.keys()).map(fromDateKey)

  try {
    await db.$transaction(async (tx) => {
      if (data.confirmDeleteAttendance) {
        await deleteAffectedAttendance(tx, dateValues, data.schoolYear, city)
      } else {
        // Same transaction as the writes below: no TOCTOU gap a concurrent
        // attendance insert could slip through to be silently skipped.
        // Teacher rows count as a conflict in their own right — a session with
        // an empty student roster still books payout hours, and importing over
        // it unconfirmed would strand them behind a holiday.
        const scope = attendanceScope(dateValues, data.schoolYear, city)
        const [studentRows, teacherRows] = await Promise.all([
          tx.attendance.findMany({ where: scope.student, select: { sessionDate: true } }),
          tx.teacherAttendance.findMany({ where: scope.teacher, select: { sessionDate: true } }),
        ])
        const conflictRows = [...studentRows, ...teacherRows]
        if (conflictRows.length > 0) {
          const conflictDateSet = new Set<string>()
          for (const r of conflictRows) conflictDateSet.add(toDateKey(r.sessionDate))
          throw new AttendanceConfirmationRequired(
            conflictRows.length,
            Array.from(conflictDateSet).sort((a, b) => a.localeCompare(b)),
          )
        }
      }

      for (const [dateKey, name] of dateToName) {
        const dateUtc = fromDateKey(dateKey)
        await tx.schoolYearHoliday.upsert({
          where: { schoolYear_city_date: { schoolYear: data.schoolYear, city, date: dateUtc } },
          create: {
            schoolYear: data.schoolYear,
            city,
            date: dateUtc,
            name,
            createdById: session.user.id,
          },
          update: { name },
        })
      }
    })
  } catch (err) {
    if (err instanceof AttendanceConfirmationRequired) {
      return {
        success: true,
        requiresConfirmation: true,
        attendanceCount: err.attendanceCount,
        conflictDates: err.conflictDates,
      }
    }
    console.error('bulkImportHolidays failed:', err)
    return { success: false, error: 'Greška pri spremanju praznika.' }
  }

  revalidatePath('/admin/skolska-godina')
  revalidatePath('/nastavnik', 'layout')
  return { success: true, requiresConfirmation: false, importedCount: dateToName.size }
}

