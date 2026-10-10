'use server'

import { db } from '@/lib/db'
import { assertTeacherOwnsGroup } from '@/lib/teacher-guard'
import {
  buildGroupMaterialsView,
  buildGroupShell,
  interactiveGuides,
} from '@/lib/group-materials-view'
import { placeLessons, PROBNI_SAT_SESSION } from '@/lib/lesson-schedule'
import { materialCityWhere } from '@/lib/material-query'
import { hasDatedModules } from '@/lib/program-kind'
import { resolveTrialDateForGroup } from '@/lib/trial-week'
import { zagrebDateKey } from '@/lib/attendance-window'
import { fromDateKey } from '@/lib/session-dates'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'

/**
 * Returns every material that applies to this group — its program's lesson
 * materials, its own group materials, and the teacher-only whole-module /
 * whole-program rows — including the hidden-in-this-group flag. Unlike the
 * portal query, staff see hidden materials (dimmed, with a toggle to re-show)
 * so they can manage them, and both audiences.
 */
async function getStaffGroupMaterials(groupId: string): Promise<StaffMaterialRow[]> {
  const { session, isAdmin } = await assertTeacherOwnsGroup(groupId)

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      course: {
        include: { modules: { select: { id: true, title: true } } },
      },
    },
  })

  const moduleIds = group.course.modules.map((m) => m.id)
  const moduleTitles = new Map(group.course.modules.map((m) => [m.id, m.title]))

  const materials = await db.material.findMany({
    where: {
      OR: [
        { scope: 'LESSON', lesson: { courseId: group.course.id } },
        { scope: 'GROUP', scheduledGroupId: group.id },
        { scope: 'COURSE', courseId: group.course.id },
        ...(moduleIds.length > 0 ? [{ scope: 'MODULE' as const, moduleId: { in: moduleIds } }] : []),
      ],
      // A material limited to the other city does not exist for this group.
      AND: [materialCityWhere(group.city)],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      uploadedBy: { select: { firstName: true, lastName: true, deletedAt: true } },
      hiddenInGroups: {
        where: { scheduledGroupId: group.id },
        select: { id: true },
      },
      lesson: { select: { id: true, title: true, moduleId: true } },
    },
  })

  return materials.map((m) => {
    const moduleId = m.lesson?.moduleId ?? m.moduleId ?? null
    return {
      id: m.id,
      moduleId,
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
      moduleTitle: moduleId ? (moduleTitles.get(moduleId) ?? null) : null,
      lessonId: m.lesson?.id ?? null,
      lessonTitle: m.lesson?.title ?? null,
      city: m.city,
      cityOnlyReason: m.cityOnlyReason,
      courseTitle: m.scope === 'COURSE' ? group.course.title : null,
      groupName: m.scope === 'GROUP' ? (group.name ?? 'Ova grupa') : null,
      hiddenInThisGroup: m.hiddenInGroups.length > 0,
      uploadedBy: m.uploadedBy ? `${m.uploadedBy.firstName} ${m.uploadedBy.lastName}` : null,
      uploadedByDeleted: m.uploadedBy?.deletedAt != null,
      uploadedById: m.uploadedById,
      // Inherited program materials are hide-only in a group (edit them on the
      // program page). GROUP materials: admin always; teacher only own.
      canEdit: m.scope === 'GROUP' && (isAdmin || m.uploadedById === session.user.id),
    }
  })
}

/**
 * Data needed by the per-group materials page to render the upload dialog:
 * the list of modules the teacher can attach MODULE-scope uploads to.
 * For radionice, this returns an empty list and callers should offer COURSE
 * scope instead.
 */
export async function getGroupUploadTargets(groupId: string) {
  await assertTeacherOwnsGroup(groupId)

  const group = await db.scheduledGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      course: {
        include: { modules: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } } },
      },
    },
  })

  return {
    groupId: group.id,
    groupName: group.name,
    courseId: group.course.id,
    courseTitle: group.course.title,
    kind: group.course.kind,
    modules: group.course.modules,
  }
}

export type StaffGuide = {
  id: string
  title: string
  description: string | null
  externalUrl: string | null
  moduleTitle: string | null
  lessonId: string
  lessonTitle: string
  inCurrentLesson: boolean
}

type StaffGuideFeed = {
  groupId: string
  courseTitle: string
  groupName: string | null
  guides: StaffGuide[]
}

/**
 * The RoboCamp guides this group can put on the classroom wall.
 *
 * Built from `buildGroupMaterialsView`, which is the group's EFFECTIVE view —
 * so a material hidden in this group is absent here too. What is presented has
 * to be what the group actually has; a teacher projecting a worksheet their own
 * class cannot open is the failure this avoids.
 *
 * A STANDARD group sees every lesson of the module it is on now, so there are
 * usually several — the presenter opens on the current lesson's guide and offers
 * the rest in a lesson picker. A COMPETITION group sees every natjecanje.
 */
export async function getGroupGuidesForStaff(groupId: string): Promise<StaffGuideFeed> {
  await assertTeacherOwnsGroup(groupId)
  // STUDENT on purpose: what goes on the classroom wall is what the children
  // themselves can open (RoboCamp guides are STUDENT-only anyway).
  const view = await buildGroupMaterialsView(groupId, 'STUDENT')

  return {
    groupId: view.group.id,
    courseTitle: view.group.course.title,
    groupName: view.group.name,
    guides: interactiveGuides(view).map(({ item, moduleTitle, lessonId, lessonTitle, inCurrentLesson }) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      externalUrl: item.externalUrl,
      moduleTitle,
      lessonId,
      lessonTitle,
      inCurrentLesson,
    })),
  }
}

export type StaffLesson = {
  id: string
  title: string
  description: string | null
  sessionNumbers: number[]
  /** First of its sats on THIS group's calendar; null when undated. */
  firstDate: Date | null
  isCurrent: boolean
  /** The next lesson to start on this group's calendar — what a teacher prepares. */
  isNext: boolean
  teacherRows: StaffMaterialRow[]
  studentRows: StaffMaterialRow[]
}

export type StaffLessonModule = {
  moduleId: string | null
  title: string | null
  isActive: boolean
  lessons: StaffLesson[]
  /** Teacher-only "every class of this module" rows. */
  teacherRows: StaffMaterialRow[]
}

export type StaffGroupLessons = {
  groupId: string
  modules: StaffLessonModule[]
  /** Teacher-only "every class of this program" rows. */
  programTeacherRows: StaffMaterialRow[]
}

/**
 * The group's Materijali tab for staff: every module's lessons placed on THIS
 * group's calendar (current + next marked), each with its teacher and kids'
 * materials — hidden ones included (dimmed, re-showable), which is why this is
 * built from `getStaffGroupMaterials` rather than the portal view.
 */
export async function getStaffGroupLessons(groupId: string): Promise<StaffGroupLessons> {
  const rows = await getStaffGroupMaterials(groupId)
  const shell = await buildGroupShell(groupId)
  const { kind, modules, activeModule } = shell

  const lessons = await db.lesson.findMany({
    where: { courseId: shell.courseId },
    select: {
      id: true,
      moduleId: true,
      title: true,
      description: true,
      sortOrder: true,
      createdAt: true,
      sessions: { select: { sessionNumber: true } },
    },
  })

  const firstModuleId = modules[0]?.id ?? null
  const hasProbni = lessons.some(
    (l) => l.moduleId === firstModuleId && l.sessions.some((s) => s.sessionNumber === PROBNI_SAT_SESSION),
  )
  const trialDate =
    hasProbni && hasDatedModules(kind)
      ? await resolveTrialDateForGroup({
          dayOfWeek: shell.group.dayOfWeek,
          schoolYear: shell.groupSchoolYear,
          city: shell.city,
          course: { kind },
        })
      : null
  const today = fromDateKey(zagrebDateKey(new Date()))

  const section = (moduleId: string | null, title: string | null): StaffLessonModule => {
    const placement = placeLessons({
      lessons: lessons
        .filter((l) => l.moduleId === moduleId)
        .map((l) => ({ ...l, sessionNumbers: l.sessions.map((s) => s.sessionNumber) })),
      sessionDates:
        moduleId !== null && hasDatedModules(kind) ? (shell.moduleSessionDates.get(moduleId) ?? null) : null,
      trialDate: moduleId === firstModuleId ? trialDate : null,
      today,
    })
    const next = placement.lessons.find((l) => l.firstDate !== null && l.firstDate > today)
    return {
      moduleId,
      title,
      isActive: moduleId !== null && moduleId === activeModule?.id,
      lessons: placement.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        sessionNumbers: l.sessionNumbers,
        firstDate: l.firstDate,
        isCurrent: l.id === placement.currentLessonId,
        isNext: l.id === next?.id,
        teacherRows: rows.filter((r) => r.lessonId === l.id && r.audience === 'TEACHER'),
        studentRows: rows.filter((r) => r.lessonId === l.id && r.audience === 'STUDENT'),
      })),
      teacherRows: rows.filter((r) => r.scope === 'MODULE' && r.moduleId === moduleId),
    }
  }

  return {
    groupId,
    modules:
      modules.length === 0
        ? [section(null, null)]
        : modules.map((m) => section(m.id, m.title)),
    programTeacherRows: rows.filter((r) => r.scope === 'COURSE'),
  }
}
