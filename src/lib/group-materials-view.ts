import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { City, Material, MaterialAudience, MaterialType, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { hasDatedModules, isCompetition, isRadionica, showsAllModules } from '@/lib/program-kind'
import {
  buildEffectiveMaterialsWhere,
  visibleLessonWhere,
  type MaterialViewer,
} from '@/lib/material-query'
import { getCurrentActiveModuleForGroup } from '@/lib/active-module'
import { getGroupModuleArc } from '@/lib/group-module-arc'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { kindOf } from '@/lib/material-display'
import { staffDisplayNames } from '@/lib/session-staff'
import { placeLessons } from '@/lib/lesson-schedule'
import { resolveTrialDateForGroup } from '@/lib/trial-week'
import { zagrebDateKey } from '@/lib/attendance-window'
import { computeSeasonSessions, fromDateKey } from '@/lib/session-dates'

export type MaterialItem = {
  id: string
  title: string
  description: string | null
  type: MaterialType
  audience: MaterialAudience
  fileUrl: string | null
  externalUrl: string | null
  fileSize: number | null
  mimeType: string | null
  sortOrder: number
  createdAt: Date
}

export type LessonView = {
  id: string
  title: string
  description: string | null
  /** Sorted; empty for an undated lesson (radionica, natjecanje, sats not picked). */
  sessionNumbers: number[]
  /** First of the lesson's sats on THIS group's calendar; null when undated. */
  firstDate: Date | null
  isCurrent: boolean
  /** Ordered by sortOrder, then createdAt. Audience-filtered for the viewer. */
  materials: MaterialItem[]
}

export type ModuleLessonsView = {
  /** null for a radionica — its lessons sit directly under the program. */
  moduleId: string | null
  title: string | null
  sortOrder: number
  /** The module this group is working through now (standard programs only). */
  isActive: boolean
  currentLessonId: string | null
  /** Placed on this group's calendar (`placeLessons`), so "current" is about today. */
  dated: boolean
  /** Dated, nothing current yet: when the first lesson begins. Null otherwise. */
  firstLessonStart: Date | null
  lessons: LessonView[]
  /** Teacher-only "every class of this module" rows. Always empty for STUDENT. */
  teacherMaterials: MaterialItem[]
}

export type GroupMaterialsView = {
  viewer: MaterialViewer
  /**
   * Parent view: every dated section carries only its current lesson
   * (`toCurrentLessonOnly`). The classroom and staff keep the whole module.
   */
  currentLessonOnly: boolean
  group: {
    id: string
    name: string | null
    dayOfWeek: string | null
    startTime: string | null
    endTime: string | null
    course: { id: string; title: string; kind: ProgramKind }
    location: { name: string }
    teacherNames: string[]
  }
  /**
   * Lesson sections. STUDENT: a standard group gets exactly one — the module it
   * is working through now, whole, with every lesson; a natjecanje group gets
   * every module; a radionica one module-less section. STAFF: every module.
   */
  modules: ModuleLessonsView[]
  /** Teacher-only "every class of this program" rows. Always empty for STUDENT. */
  programTeacherMaterials: MaterialItem[]
  /** Convenience: id of the module the group is working on now. */
  activeModuleId: string | null
}

type InteractiveGuide = {
  item: MaterialItem
  /** Which module the guide belongs to, when the program has modules. */
  moduleTitle: string | null
  lessonId: string
  lessonTitle: string
  /**
   * The guide sits in the lesson that is current for this group ON ITS
   * CALENDAR. An undated lesson (radionica, natjecanje) is "current" only
   * because it comes first, so it never carries this — otherwise every
   * natjecanje's first guide would claim to be today's.
   */
  inCurrentLesson: boolean
}

/**
 * Every RoboCamp guide in view, each carrying its module and lesson title.
 * RoboCamp guides are STUDENT-only by rule, so this is the same list for staff
 * and for the portal.
 */
export function interactiveGuides(view: GroupMaterialsView): InteractiveGuide[] {
  return view.modules.flatMap((section) =>
    section.lessons.flatMap((lesson) =>
      lesson.materials
        .filter((item) => kindOf(item) === 'robocamp')
        .map((item) => ({
          item,
          moduleTitle: section.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          inCurrentLesson: lesson.isCurrent && lesson.firstDate !== null,
        })),
    ),
  )
}

function toItem(m: Material): MaterialItem {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    type: m.type,
    audience: m.audience,
    fileUrl: m.fileUrl,
    externalUrl: m.externalUrl,
    fileSize: m.fileSize,
    mimeType: m.mimeType,
    sortOrder: m.sortOrder,
    createdAt: m.createdAt,
  }
}

export type GroupShell = {
  group: GroupMaterialsView['group']
  courseId: string
  kind: ProgramKind
  /** Every module of the course, in sortOrder. Empty for radionice. */
  modules: { id: string; title: string; sortOrder: number }[]
  /** The module this group is working through now — null for COMPETITION. */
  activeModule: { id: string; title: string; sortOrder: number } | null
  /** Modules whose lessons the PORTAL may see (staff see every module). */
  visibleModuleIds: string[]
  /**
   * Each module's sats on this group's calendar, by module id: a standard
   * module's 7 on its own arc, a natjecanje's weekly season termini. Absent =
   * undated (radionica, no plan, no season).
   */
  moduleSessionDates: Map<string, Date[]>
  /** The group's own school year (what its trial week is keyed on). */
  groupSchoolYear: string
  city: City
}

/**
 * Loads a group and resolves its pacing — everything about the group that is
 * true regardless of which panel is being rendered.
 *
 * Wrapped in React `cache()` because the portal group route resolves this
 * TWICE per navigation: once in the layout (which draws the header and the tab
 * strip) and once inside `buildGroupMaterialsView` for the Materijali panel.
 * Without the memo that is two identical group+modules+schedules queries on
 * every tab switch.
 *
 * Does NOT authorize the caller; the caller (student enrollment gate, or staff
 * ownership gate) must do that first. Throws notFound() if the group does not
 * exist.
 */
export const buildGroupShell = cache(async function buildGroupShell(
  groupId: string,
): Promise<GroupShell> {
  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    include: {
      course: {
        include: {
          modules: {
            orderBy: { sortOrder: 'asc' },
            include: { schedules: true },
          },
          seasons: { select: { schoolYear: true, city: true, startDate: true, endDate: true } },
        },
      },
      location: true,
      teacherAssignments: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  })
  if (!group) notFound()

  const kind = group.course.kind
  const allModules = showsAllModules(kind)
  // Pacing follows the group's own year and city: its holiday calendar and its
  // module schedule rows. Never today's year — through the summer that still
  // names the year that is ending, and a next-year group would be paced off
  // last year's module dates.
  const schoolYear = group.schoolYear
  const holidayDates = await loadHolidayDateKeys(schoolYear, group.city)
  const activeModule = getCurrentActiveModuleForGroup({
    dayOfWeek: group.dayOfWeek,
    modules: group.course.modules,
    schoolYear,
    city: group.city,
    kind,
    holidayDates,
  })

  // Standard programs: kids only see the module they're working on now (per this
  // group's calendar); other modules' materials are hidden. COMPETITION: every
  // natjecanje is live all season and nothing in the data says which one this
  // group attends, so all of them are visible. Radionice have no modules at all.
  // Program-wide (COURSE) and group (GROUP) materials stay visible either way.
  let visibleModuleIds: string[] = []
  if (allModules) visibleModuleIds = group.course.modules.map((m) => m.id)
  else if (activeModule) visibleModuleIds = [activeModule.id]

  // Where each module's seven sats fall for THIS group — what a lesson's sat
  // numbers are resolved against. Same inputs as the active-module pick above.
  const moduleSessionDates = new Map<string, Date[]>()
  if (hasDatedModules(kind)) {
    const arc = getGroupModuleArc({
      dayOfWeek: group.dayOfWeek,
      modules: group.course.modules.map((m) => {
        const schedule =
          m.schedules.find((sc) => sc.city === group.city && sc.schoolYear === schoolYear) ?? null
        return {
          id: m.id,
          title: m.title,
          sortOrder: m.sortOrder,
          schedule: schedule
            ? { id: schedule.id, startDate: schedule.startDate, endDate: schedule.endDate }
            : null,
        }
      }),
      holidayDates,
    })
    for (const entry of arc) moduleSessionDates.set(entry.moduleId, entry.sessionDates)
  } else if (isCompetition(kind)) {
    // A natjecanje meets once a week all season, and every natjecanje runs the
    // whole season — sat N of any of them is the group's Nth weekly termin.
    const season =
      group.course.seasons.find((x) => x.schoolYear === schoolYear && x.city === group.city) ?? null
    const seasonDates = season
      ? computeSeasonSessions({
          dayOfWeek: group.dayOfWeek,
          startDate: season.startDate,
          endDate: season.endDate,
          holidayDates,
        })
      : []
    if (seasonDates.length > 0) {
      for (const m of group.course.modules) moduleSessionDates.set(m.id, seasonDates)
    }
  }

  return {
    group: {
      id: group.id,
      name: group.name,
      dayOfWeek: group.dayOfWeek,
      startTime: group.startTime,
      endTime: group.endTime,
      course: {
        id: group.course.id,
        title: group.course.title,
        kind,
      },
      location: { name: group.location.name },
      teacherNames: staffDisplayNames(
        group.teacherAssignments.map((t) => ({
          role: t.role,
          name: `${t.user.firstName} ${t.user.lastName}`,
        })),
      ),
    },
    courseId: group.course.id,
    kind,
    modules: group.course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
    })),
    activeModule: activeModule
      ? {
          id: activeModule.id,
          title: activeModule.title,
          sortOrder: activeModule.sortOrder,
        }
      : null,
    visibleModuleIds,
    moduleSessionDates,
    groupSchoolYear: group.schoolYear,
    city: group.city,
  }
})

/**
 * Loads a group and computes its lesson-structured material view for `viewer`
 * — respecting per-group hides, and for STUDENT dropping every TEACHER row.
 * Does NOT authorize the caller; the caller (portal gate, or staff ownership
 * gate) must do that first, and must pass STAFF only for a staff caller. Throws
 * notFound() if the group does not exist.
 */
export async function buildGroupMaterialsView(
  groupId: string,
  viewer: MaterialViewer,
): Promise<GroupMaterialsView> {
  const shell = await buildGroupShell(groupId)
  const { kind, activeModule, modules } = shell

  // The portal sees the module the group is on now (natjecanje: all of them);
  // staff see every module of the program.
  const moduleIds = viewer === 'STAFF' ? modules.map((m) => m.id) : shell.visibleModuleIds

  const [lessons, materials] = await Promise.all([
    db.lesson.findMany({
      where: visibleLessonWhere(shell.courseId, moduleIds),
      select: {
        id: true,
        moduleId: true,
        title: true,
        description: true,
        sortOrder: true,
        createdAt: true,
        sessions: { select: { sessionNumber: true } },
      },
    }),
    db.material.findMany({
      where: buildEffectiveMaterialsWhere({
        scheduledGroupId: shell.group.id,
        courseId: shell.courseId,
        moduleIds,
        viewer,
        city: shell.city,
      }),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  const byLesson = new Map<string, MaterialItem[]>()
  const byModule = new Map<string, MaterialItem[]>()
  const programTeacherMaterials: MaterialItem[] = []
  for (const m of materials) {
    const item = toItem(m)
    if (m.lessonId) pushTo(byLesson, m.lessonId, item)
    else if (m.scope === 'MODULE' && m.moduleId) pushTo(byModule, m.moduleId, item)
    else if (m.scope === 'COURSE') programTeacherMaterials.push(item)
  }

  // The probni sat (sat 0) exists only before a standard program's first module.
  const firstModuleId = modules[0]?.id ?? null
  const needsTrial =
    hasDatedModules(kind) &&
    firstModuleId !== null &&
    moduleIds.includes(firstModuleId) &&
    lessons.some((l) => l.moduleId === firstModuleId && l.sessions.some((s) => s.sessionNumber === 0))
  const trialDate = needsTrial
    ? await resolveTrialDateForGroup({
        dayOfWeek: shell.group.dayOfWeek,
        schoolYear: shell.groupSchoolYear,
        city: shell.city,
        course: { kind },
      })
    : null

  const today = fromDateKey(zagrebDateKey(new Date()))

  const sectionFor = (
    moduleId: string | null,
    title: string | null,
    sortOrder: number,
  ): ModuleLessonsView => {
    const own = lessons.filter((l) => l.moduleId === moduleId)
    const sessionDates = moduleId === null ? null : (shell.moduleSessionDates.get(moduleId) ?? null)
    const placement = placeLessons({
      lessons: own.map((l) => ({ ...l, sessionNumbers: l.sessions.map((s) => s.sessionNumber) })),
      sessionDates,
      trialDate: moduleId === firstModuleId ? trialDate : null,
      today,
    })
    return {
      moduleId,
      title,
      sortOrder,
      isActive: moduleId !== null && moduleId === activeModule?.id,
      currentLessonId: placement.currentLessonId,
      dated: placement.dated,
      firstLessonStart:
        placement.dated && placement.currentLessonId === null
          ? (placement.lessons.find((l) => l.firstDate !== null)?.firstDate ?? null)
          : null,
      lessons: placement.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        sessionNumbers: l.sessionNumbers,
        firstDate: l.firstDate,
        isCurrent: l.id === placement.currentLessonId,
        materials: byLesson.get(l.id) ?? [],
      })),
      teacherMaterials: moduleId === null ? [] : (byModule.get(moduleId) ?? []),
    }
  }

  const sections: ModuleLessonsView[] = isRadionica(kind)
    ? [sectionFor(null, null, 0)]
    : modules
        .filter((m) => moduleIds.includes(m.id))
        .map((m) => sectionFor(m.id, m.title, m.sortOrder))

  return {
    viewer,
    currentLessonOnly: false,
    group: shell.group,
    modules: sections,
    programTeacherMaterials,
    activeModuleId: activeModule?.id ?? null,
  }
}

/**
 * The parent's cut of a STUDENT view (owner, 2026-10-26): a dated section keeps
 * only the lesson that is current on this group's calendar — from the day of
 * its first sat until the next lesson's — and nothing before the first lesson
 * starts. An undated section (radionica, a natjecanje without sats) has no
 * "current" on the calendar and keeps every lesson, as before.
 *
 * Applied on the server so the other lessons never reach the browser; the
 * download route applies the same cut (`currentLessonMaterialIds`).
 */
export function toCurrentLessonOnly(view: GroupMaterialsView): GroupMaterialsView {
  return {
    ...view,
    currentLessonOnly: true,
    modules: view.modules.map((section) =>
      section.dated
        ? { ...section, lessons: section.lessons.filter((l) => l.id === section.currentLessonId) }
        : section,
    ),
  }
}

/** Every material id the view lists — what the portal may download from it. */
export function viewMaterialIds(view: GroupMaterialsView): Set<string> {
  return new Set(view.modules.flatMap((s) => s.lessons.flatMap((l) => l.materials.map((m) => m.id))))
}

function pushTo<K>(map: Map<K, MaterialItem[]>, key: K, item: MaterialItem) {
  const list = map.get(key)
  if (list) list.push(item)
  else map.set(key, [item])
}
