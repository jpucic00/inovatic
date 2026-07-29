'use server'

import type { ProgramKind } from '@prisma/client'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import type { StaffMaterialRow } from '@/components/material/staff-material-list'
import { publicSignupPath } from '@/lib/signup-links'

type ProgramModuleSection = {
  module: { id: string; title: string }
  materials: StaffMaterialRow[]
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
     * Public signup link for this program, e.g. `/upisi/slr-2` — or
     * `/radionice/<slug>` for a radionica, which has no `/upisi` page.
     */
    signupPath: string
  }
  /** Selected-year season bounds — COMPETITION only, null elsewhere. */
  season: { startDate: Date | null; endDate: Date | null }
  selectedYear: string
  /** Module date rows for ModuleDatesTable (standard programs only). */
  moduleDates: ProgramModuleDate[]
  /** COURSE-scoped "whole program" materials. */
  courseMaterials: StaffMaterialRow[]
  /** Per-module MODULE-scoped materials (standard programs only). */
  moduleSections: ProgramModuleSection[]
}

/**
 * Everything the admin program-detail page needs: course info, this year's
 * module dates, and the program's materials (COURSE + per-module MODULE).
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
      // Shared course, city-scoped view: only the caller's city's groups,
      // window, and module dates.
      _count: { select: { scheduledGroups: { where: { city } } } },
      enrollmentWindows: {
        where: { schoolYear: year, city },
        select: { enrollmentStart: true, enrollmentEnd: true },
      },
      seasons: {
        where: { schoolYear: year, city },
        select: { startDate: true, endDate: true },
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

  const materials = await db.material.findMany({
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
  })

  const toRow = (m: (typeof materials)[number]): StaffMaterialRow => ({
    id: m.id,
    title: m.title,
    description: m.description,
    type: m.type,
    scope: m.scope,
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
  })

  const courseMaterials = materials.filter((m) => m.scope === 'COURSE').map(toRow)
  const moduleSections: ProgramModuleSection[] = course.modules.map((mod) => ({
    module: { id: mod.id, title: mod.title },
    materials: materials.filter((m) => m.scope === 'MODULE' && m.moduleId === mod.id).map(toRow),
  }))

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
    selectedYear: year,
    moduleDates,
    courseMaterials,
    moduleSections,
  }
}
