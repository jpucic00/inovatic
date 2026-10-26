'use server'

import type { City, ProgramKind } from '@prisma/client'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'
import { publicSignupPath } from '@/lib/signup-links'
import { defaultGradesForLevel } from '@/lib/inquiry-availability'
import type { ElementaryGrade } from '@/lib/inquiry-status'
import { hasDatedModules, isCompetition } from '@/lib/program-kind'
import { lessonSessionSlots, placeLessons } from '@/lib/lesson-schedule'
import {
  moduleSatDateRanges,
  seasonSatDateRanges,
  type SatDateRange,
} from '@/lib/lesson-sat-dates'
import { loadHolidayDateKeys } from '@/lib/holidays'

export type ProgramLessonRow = {
  id: string
  title: string
  /** Sorted; empty = undated. */
  sessionNumbers: number[]
  /** Curriculum (LESSON) materials per audience — group additions not counted. */
  teacherCount: number
  studentCount: number
}

export type ProgramLessonModule = {
  /** null for a radionica — its lessons sit directly under the program. */
  module: { id: string; title: string } | null
  isFirstModule: boolean
  /**
   * Standard modules hold sats 1–7 (+ probni sat on the first), natjecanja
   * weekly season sats; radionica lessons are undated.
   */
  dated: boolean
  /** Display order (by first sat, undated last). */
  lessons: ProgramLessonRow[]
  /** Sample dates per sat in the admin's city and selected year (dated only). */
  satDates: SatDateRange[]
  /** Teacher-only "every class of this module" rows. */
  teacherMaterials: StaffMaterialRow[]
}

type ProgramModuleDate = {
  id: string
  title: string
  sortOrder: number
  scheduleId: string | null
  startDate: Date | null
  endDate: Date | null
  enrollmentCount: number
}

type ProgramDetail = {
  course: {
    id: string
    title: string
    /** Radionica copy — editable from this page's Uredi dialog. */
    description: string
    level: string | null
    kind: ProgramKind
    ageMin: number
    ageMax: number
    price: number | null
    equipment: string | null
    groupCount: number
    /** Selected-year public signup window (null when unset). */
    enrollmentStart: Date | null
    enrollmentEnd: Date | null
    /**
     * Public signup link for this program, e.g. `/prijava/slr-2` — or
     * `/radionice/<slug>` for a radionica, which has no `/prijava` page.
     */
    signupPath: string
  }
  /** Selected-year season bounds — COMPETITION only, null elsewhere. */
  season: { startDate: Date | null; endDate: Date | null }
  /**
   * Selected-year razred rule for this city. `grades: null` = no override
   * saved, so the program follows `defaults` (the built-in ladder).
   */
  gradeRule: { grades: ElementaryGrade[] | null; defaults: ElementaryGrade[] }
  selectedYear: string
  /** Module date rows for ModuleDatesTable (standard programs only). */
  moduleDates: ProgramModuleDate[]
  /** Teacher-only "every class of this program" (COURSE) rows. */
  programTeacherMaterials: StaffMaterialRow[]
  /** The admin's city — "Samo za moj grad" always means this one. */
  viewerCity: City
  /**
   * How many of this program's curriculum materials are limited to one city,
   * per city — the drift the owner wants visible (empty entries omitted).
   */
  cityOnlyCounts: { city: City; count: number }[]
  /** One entry per module (one module-less entry for a radionica). */
  lessonModules: ProgramLessonModule[]
}

/**
 * Everything the admin program-detail page needs: course info, this year's
 * module dates, the program's lessons per module (with sample sat dates for
 * the admin's city) and the teacher-only whole-program / whole-module rows.
 * Admin-only. Materials carry no per-group hide context here.
 */
export async function getProgramDetail(courseId: string): Promise<ProgramDetail> {
  const { city } = await requireAdminCtx()
  const year = await getSelectedSchoolYear()

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      level: true,
      kind: true,
      city: true,
      ageMin: true,
      ageMax: true,
      price: true,
      equipment: true,
      // Shared course, city- and year-scoped view: only the caller's city's
      // groups, window, and module dates for the selected year. The group count
      // links straight to `/admin/grupe`, which lists exactly that set.
      _count: { select: { scheduledGroups: { where: { city, schoolYear: year } } } },
      enrollmentWindows: {
        where: { schoolYear: year, city },
        select: { enrollmentStart: true, enrollmentEnd: true },
      },
      seasons: {
        where: { schoolYear: year, city },
        select: { startDate: true, endDate: true },
      },
      gradeRules: {
        where: { schoolYear: year, city },
        select: { grades: true },
      },
      modules: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          schedules: {
            where: { schoolYear: year, city },
            select: {
              id: true,
              startDate: true,
              endDate: true,
              _count: { select: { moduleEnrollments: true } },
            },
          },
        },
      },
    },
  })
  // Cross-city radionice read as nonexistent (standard programs are shared).
  if (!course || (course.city !== null && course.city !== city)) notFound()

  const moduleIds = course.modules.map((m) => m.id)
  const moduleTitles = new Map(course.modules.map((m) => [m.id, m.title]))

  const [materials, lessons, lessonCounts, satDatesByModule, cityOnly] = await Promise.all([
    db.material.findMany({
      where: {
        OR: [
          { scope: 'COURSE', courseId: course.id },
          ...(moduleIds.length > 0 ? [{ scope: 'MODULE' as const, moduleId: { in: moduleIds } }] : []),
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        uploadedBy: { select: { firstName: true, lastName: true, deletedAt: true } },
      },
    }),
    db.lesson.findMany({
      where: { courseId: course.id },
      select: {
        id: true,
        moduleId: true,
        title: true,
        sortOrder: true,
        createdAt: true,
        sessions: { select: { sessionNumber: true } },
      },
    }),
    db.material.groupBy({
      by: ['lessonId', 'audience'],
      where: { scope: 'LESSON', lesson: { courseId: course.id } },
      _count: { _all: true },
    }),
    loadSatDatesFor(course, course.modules, year, city),
    db.material.groupBy({
      by: ['city'],
      where: {
        city: { not: null },
        OR: [
          { scope: 'LESSON', lesson: { courseId: course.id } },
          { scope: 'COURSE', courseId: course.id },
          ...(moduleIds.length > 0 ? [{ scope: 'MODULE' as const, moduleId: { in: moduleIds } }] : []),
        ],
      },
      _count: { _all: true },
    }),
  ])

  const toRow = (m: (typeof materials)[number]): StaffMaterialRow => ({
    id: m.id,
    title: m.title,
    description: m.description,
    type: m.type,
    scope: m.scope,
    audience: m.audience,
    fileUrl: m.fileUrl,
    externalUrl: m.externalUrl,
    fileSize: m.fileSize,
    mimeType: m.mimeType,
    sortOrder: m.sortOrder,
    moduleId: m.moduleId ?? null,
    moduleTitle: m.scope === 'MODULE' && m.moduleId ? moduleTitles.get(m.moduleId) ?? null : null,
    courseTitle: m.scope === 'COURSE' ? course.title : null,
    groupName: null,
    hiddenInThisGroup: false,
    uploadedBy: m.uploadedBy ? `${m.uploadedBy.firstName} ${m.uploadedBy.lastName}` : null,
    uploadedByDeleted: m.uploadedBy?.deletedAt != null,
    city: m.city,
    cityOnlyReason: m.cityOnlyReason,
    otherCityOnly: m.city !== null && m.city !== city,
    // The other city's city-only row is read-only here (`otherCityOnlyError`).
    canEdit: m.city === null || m.city === city,
  })

  const countFor = (lessonId: string, audience: 'STUDENT' | 'TEACHER') =>
    lessonCounts.find((c) => c.lessonId === lessonId && c.audience === audience)?._count._all ?? 0

  const dated = hasDatedModules(course.kind) || isCompetition(course.kind)
  const lessonModuleFor = (
    module: { id: string; title: string } | null,
    isFirstModule: boolean,
  ): ProgramLessonModule => {
    const own = lessons.filter((l) => l.moduleId === (module?.id ?? null))
    // Display order only — no group, so no dates and no "current".
    const placed = placeLessons({
      lessons: own.map((l) => ({ ...l, sessionNumbers: l.sessions.map((x) => x.sessionNumber) })),
      sessionDates: null,
      trialDate: null,
      today: new Date(),
    }).lessons
    return {
      module,
      isFirstModule,
      dated: dated && module !== null,
      lessons: placed.map((l) => ({
        id: l.id,
        title: l.title,
        sessionNumbers: l.sessionNumbers,
        teacherCount: countFor(l.id, 'TEACHER'),
        studentCount: countFor(l.id, 'STUDENT'),
      })),
      satDates: module ? (satDatesByModule.get(module.id) ?? []) : [],
      teacherMaterials: module
        ? materials.filter((m) => m.scope === 'MODULE' && m.moduleId === module.id).map(toRow)
        : [],
    }
  }

  const programTeacherMaterials = materials.filter((m) => m.scope === 'COURSE').map(toRow)
  const lessonModules: ProgramLessonModule[] =
    course.modules.length === 0
      ? [lessonModuleFor(null, false)]
      : course.modules.map((mod, index) =>
          lessonModuleFor({ id: mod.id, title: mod.title }, index === 0),
        )

  const moduleDates: ProgramModuleDate[] = course.modules.map((mod) => {
    const schedule = mod.schedules[0] ?? null
    return {
      id: mod.id,
      title: mod.title,
      sortOrder: mod.sortOrder,
      scheduleId: schedule?.id ?? null,
      startDate: schedule?.startDate ?? null,
      endDate: schedule?.endDate ?? null,
      enrollmentCount: schedule?._count.moduleEnrollments ?? 0,
    }
  })

  return {
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      level: course.level,
      kind: course.kind,
      ageMin: course.ageMin,
      ageMax: course.ageMax,
      price: course.price,
      equipment: course.equipment,
      groupCount: course._count.scheduledGroups,
      enrollmentStart: course.enrollmentWindows[0]?.enrollmentStart ?? null,
      enrollmentEnd: course.enrollmentWindows[0]?.enrollmentEnd ?? null,
      signupPath: publicSignupPath(course.kind, course.slug),
    },
    season: {
      startDate: course.seasons[0]?.startDate ?? null,
      endDate: course.seasons[0]?.endDate ?? null,
    },
    gradeRule: {
      // No row means the program still follows the default ladder — the editor
      // shows `defaults` in that case, so the two must stay distinguishable.
      grades: (course.gradeRules[0]?.grades as ElementaryGrade[] | undefined) ?? null,
      defaults: defaultGradesForLevel(course.level),
    },
    selectedYear: year,
    moduleDates,
    programTeacherMaterials,
    lessonModules,
    viewerCity: city,
    cityOnlyCounts: cityOnly
      .filter((c): c is typeof c & { city: City } => c.city !== null)
      .map((c) => ({ city: c.city, count: c._count._all })),
  }
}

type SatDateModule = {
  id: string
  title: string
  sortOrder: number
  schedules: { id: string; startDate: Date | null; endDate: Date | null }[]
}

/**
 * Sample sat dates per module for the lesson editor's hint: a standard
 * program's module arcs, or — for a natjecanje — the weekly termini of the
 * city's season, the same list under every natjecanje. Radionice have none.
 */
async function loadSatDatesFor(
  course: { id: string; kind: ProgramKind },
  modules: SatDateModule[],
  schoolYear: string,
  city: City,
): Promise<Map<string, SatDateRange[]>> {
  if (hasDatedModules(course.kind)) return loadSatDateRanges(modules, schoolYear, city)
  if (!isCompetition(course.kind) || modules.length === 0) return new Map()
  const [holidayDates, season] = await Promise.all([
    loadHolidayDateKeys(schoolYear, city),
    db.courseSeason.findUnique({
      where: { courseId_schoolYear_city: { courseId: course.id, schoolYear, city } },
      select: { startDate: true, endDate: true },
    }),
  ])
  const ranges = seasonSatDateRanges({ season, holidayDates })
  return new Map(modules.map((m) => [m.id, ranges]))
}

/**
 * Sample sat dates for every module of a standard program, in one city and
 * school year — the hint next to each sat in the lesson editor.
 */
async function loadSatDateRanges(
  modules: SatDateModule[],
  schoolYear: string,
  city: City,
): Promise<Map<string, SatDateRange[]>> {
  const [holidayDates, trialWeek] = await Promise.all([
    loadHolidayDateKeys(schoolYear, city),
    db.trialWeek.findUnique({
      where: { schoolYear_city: { schoolYear, city } },
      select: { startDate: true, endDate: true },
    }),
  ])
  return moduleSatDateRanges({
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
      schedule: m.schedules[0]
        ? { id: m.schedules[0].id, startDate: m.schedules[0].startDate, endDate: m.schedules[0].endDate }
        : null,
    })),
    holidayDates,
    trialWeek,
  })
}

export type LessonEditorContext = {
  /** The admin's city — "Samo za moj grad" always means this one. */
  viewerCity: City
  course: { id: string; title: string; kind: ProgramKind }
  /** null for a radionica. */
  module: { id: string; title: string } | null
  isFirstModule: boolean
  dated: boolean
  /** null on the "Nova lekcija" page. */
  lesson: {
    id: string
    title: string
    description: string | null
    sessionNumbers: number[]
  } | null
  /** Sats other lessons of this module already hold. */
  takenSessions: { sessionNumber: number; lessonTitle: string }[]
  /** The sats the picker offers, in order (`lessonSessionSlots`). */
  sessionSlots: number[]
  satDates: SatDateRange[]
  /** Other lessons of the same module — targets for "Premjesti u lekciju". */
  siblingLessons: { id: string; title: string; sessionNumbers: number[] }[]
  teacherMaterials: StaffMaterialRow[]
  studentMaterials: StaffMaterialRow[]
  /** Groups' own additions in this lesson (managed on each group's page). */
  groupMaterialCount: number
  selectedYear: string
}

/**
 * Everything the lesson page needs — for an existing lesson (`lessonId`) or a
 * new one in `moduleId` (null for a radionica). Admin-only; the sample sat
 * dates use the admin's city and sidebar year.
 */
export async function getLessonEditorContext(
  courseId: string,
  target: { lessonId: string } | { moduleId: string | null },
): Promise<LessonEditorContext> {
  const { city } = await requireAdminCtx()
  const year = await getSelectedSchoolYear()

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      kind: true,
      city: true,
      modules: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          schedules: {
            where: { schoolYear: year, city },
            select: { id: true, startDate: true, endDate: true },
          },
        },
      },
    },
  })
  if (!course || (course.city !== null && course.city !== city)) notFound()

  let lessonRow: {
    id: string
    title: string
    description: string | null
    moduleId: string | null
    sessions: { sessionNumber: number }[]
  } | null = null
  let moduleId: string | null
  if ('lessonId' in target) {
    lessonRow = await db.lesson.findUnique({
      where: { id: target.lessonId },
      select: {
        id: true,
        title: true,
        description: true,
        moduleId: true,
        courseId: true,
        sessions: { select: { sessionNumber: true } },
      },
    }).then((l) => (l?.courseId === course.id ? l : null))
    if (!lessonRow) notFound()
    moduleId = lessonRow.moduleId
  } else {
    moduleId = target.moduleId
    if (moduleId !== null && !course.modules.some((m) => m.id === moduleId)) notFound()
    if (moduleId === null && course.modules.length > 0) notFound()
  }

  const mod = moduleId ? course.modules.find((m) => m.id === moduleId) ?? null : null
  const dated = (hasDatedModules(course.kind) || isCompetition(course.kind)) && mod !== null
  const currentLessonId = lessonRow?.id ?? null

  const [siblings, materials, groupMaterialCount, satDatesByModule] = await Promise.all([
    db.lesson.findMany({
      where: { courseId: course.id, moduleId, ...(currentLessonId ? { id: { not: currentLessonId } } : {}) },
      select: {
        id: true,
        title: true,
        sortOrder: true,
        createdAt: true,
        sessions: { select: { sessionNumber: true } },
      },
    }),
    currentLessonId
      ? db.material.findMany({
          where: { scope: 'LESSON', lessonId: currentLessonId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { uploadedBy: { select: { firstName: true, lastName: true, deletedAt: true } } },
        })
      : Promise.resolve([]),
    currentLessonId
      ? db.material.count({ where: { scope: 'GROUP', lessonId: currentLessonId } })
      : Promise.resolve(0),
    dated ? loadSatDatesFor(course, course.modules, year, city) : Promise.resolve(new Map<string, SatDateRange[]>()),
  ])

  const placedSiblings = placeLessons({
    lessons: siblings.map((l) => ({ ...l, sessionNumbers: l.sessions.map((x) => x.sessionNumber) })),
    sessionDates: null,
    trialDate: null,
    today: new Date(),
  }).lessons

  const toRow = (m: (typeof materials)[number]): StaffMaterialRow => ({
    id: m.id,
    title: m.title,
    description: m.description,
    type: m.type,
    scope: m.scope,
    audience: m.audience,
    fileUrl: m.fileUrl,
    externalUrl: m.externalUrl,
    fileSize: m.fileSize,
    mimeType: m.mimeType,
    sortOrder: m.sortOrder,
    moduleId,
    moduleTitle: mod?.title ?? null,
    lessonId: currentLessonId,
    lessonTitle: lessonRow?.title ?? null,
    courseTitle: null,
    groupName: null,
    hiddenInThisGroup: false,
    uploadedBy: m.uploadedBy ? `${m.uploadedBy.firstName} ${m.uploadedBy.lastName}` : null,
    uploadedByDeleted: m.uploadedBy?.deletedAt != null,
    city: m.city,
    cityOnlyReason: m.cityOnlyReason,
    otherCityOnly: m.city !== null && m.city !== city,
    // The other city's city-only row is read-only here (`otherCityOnlyError`).
    canEdit: m.city === null || m.city === city,
  })

  const satDates = mod ? (satDatesByModule.get(mod.id) ?? []) : []
  const isFirstModule = mod !== null && course.modules[0]?.id === mod.id

  return {
    viewerCity: city,
    course: { id: course.id, title: course.title, kind: course.kind },
    module: mod ? { id: mod.id, title: mod.title } : null,
    isFirstModule,
    dated,
    lesson: lessonRow
      ? {
          id: lessonRow.id,
          title: lessonRow.title,
          description: lessonRow.description,
          sessionNumbers: lessonRow.sessions.map((x) => x.sessionNumber).sort((a, b) => a - b),
        }
      : null,
    takenSessions: placedSiblings.flatMap((l) =>
      l.sessionNumbers.map((sessionNumber) => ({ sessionNumber, lessonTitle: l.title })),
    ),
    sessionSlots: dated
      ? lessonSessionSlots({
          competition: isCompetition(course.kind),
          isFirstModule,
          seasonSessionCount: satDates.at(-1)?.sessionNumber ?? 0,
          held: [
            ...(lessonRow?.sessions.map((x) => x.sessionNumber) ?? []),
            ...placedSiblings.flatMap((l) => l.sessionNumbers),
          ],
        })
      : [],
    satDates,
    siblingLessons: placedSiblings.map((l) => ({
      id: l.id,
      title: l.title,
      sessionNumbers: l.sessionNumbers,
    })),
    teacherMaterials: materials.filter((m) => m.audience === 'TEACHER').map(toRow),
    studentMaterials: materials.filter((m) => m.audience === 'STUDENT').map(toRow),
    groupMaterialCount,
    selectedYear: year,
  }
}
