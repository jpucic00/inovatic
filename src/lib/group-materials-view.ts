import { notFound } from 'next/navigation'
import type { MaterialType } from '@prisma/client'
import { db } from '@/lib/db'
import { computeSchoolYear } from '@/lib/school-year'
import { buildEffectiveMaterialsWhere } from '@/lib/material-query'
import { getCurrentActiveModuleForGroup } from '@/lib/active-module'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { isRobocampUrl } from '@/lib/robocamp-proxy'

export type MaterialItem = {
  id: string
  title: string
  description: string | null
  type: MaterialType
  fileUrl: string | null
  externalUrl: string | null
  fileSize: number | null
  mimeType: string | null
  sortOrder: number
  createdAt: Date
}

/** The four display buckets the kids' page separates materials into. */
type MaterialKind = 'robocamp' | 'videos' | 'docs' | 'links'

export type KindBuckets = {
  robocamp: MaterialItem[]
  videos: MaterialItem[]
  docs: MaterialItem[]
  links: MaterialItem[]
}

export type ModuleMaterialGroup = {
  moduleId: string
  title: string
  sortOrder: number
  isActive: boolean
  buckets: KindBuckets
}

export type GroupMaterialsView = {
  group: {
    id: string
    name: string | null
    dayOfWeek: string | null
    startTime: string | null
    endTime: string | null
    course: { id: string; title: string; isCustom: boolean }
    location: { name: string }
    teacherNames: string[]
  }
  /** Active-module RoboCamp tutorials, surfaced at the very top of the page. */
  featuredRobocamp: MaterialItem[]
  /** Per-module sections for standard programs. Empty for radionice. */
  moduleSections: ModuleMaterialGroup[]
  /** COURSE-scoped materials on a standard program ("for the whole program"). */
  programMaterials: KindBuckets
  /** GROUP-scoped materials (this group's own extras). */
  groupMaterials: KindBuckets
  /** Radionice flat bucket (COURSE + GROUP); empty for standard programs. */
  radionicaMaterials: KindBuckets
  /** Convenience: id of the module the student is likely working on now. */
  activeModuleId: string | null
}

function emptyBuckets(): KindBuckets {
  return { robocamp: [], videos: [], docs: [], links: [] }
}

export function bucketsAreEmpty(b: KindBuckets): boolean {
  return b.robocamp.length + b.videos.length + b.docs.length + b.links.length === 0
}

/**
 * Classifies a material into one of the four kid-facing buckets. RoboCamp is
 * detected by the first-class type OR (as a fallback for any un-backfilled row)
 * a RoboCamp externalUrl.
 */
export function kindOf(item: { type: MaterialType; externalUrl: string | null }): MaterialKind {
  if (item.type === 'ROBOCAMP' || (item.externalUrl && isRobocampUrl(item.externalUrl))) {
    return 'robocamp'
  }
  if (item.type === 'VIDEO') return 'videos'
  if (item.type === 'LINK') return 'links'
  return 'docs' // DOCUMENT, PRESENTATION
}

function toItem(m: {
  id: string
  title: string
  description: string | null
  type: MaterialType
  fileUrl: string | null
  externalUrl: string | null
  fileSize: number | null
  mimeType: string | null
  sortOrder: number
  createdAt: Date
}): MaterialItem {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    type: m.type,
    fileUrl: m.fileUrl,
    externalUrl: m.externalUrl,
    fileSize: m.fileSize,
    mimeType: m.mimeType,
    sortOrder: m.sortOrder,
    createdAt: m.createdAt,
  }
}

/**
 * Loads a group and computes the effective, kind-partitioned material view a
 * student sees — respecting per-group hides. Does NOT authorize the caller;
 * the caller (student enrollment gate, or staff ownership gate) must do that
 * first. Throws notFound() if the group does not exist.
 */
export async function buildGroupMaterialsView(groupId: string): Promise<GroupMaterialsView> {
  const schoolYear = computeSchoolYear()

  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    include: {
      course: {
        include: {
          modules: {
            orderBy: { sortOrder: 'asc' },
            include: { schedules: { where: { schoolYear } } },
          },
        },
      },
      location: true,
      teacherAssignments: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  })
  if (!group) notFound()

  const isCustom = group.course.isCustom
  const holidayDates = await loadHolidayDateKeys(schoolYear)
  const activeModule = getCurrentActiveModuleForGroup({
    dayOfWeek: group.dayOfWeek,
    modules: group.course.modules,
    schoolYear,
    holidayDates,
  })

  // Kids only see the module they're working on now (per this group's calendar).
  // Other modules' materials are hidden; program-wide (COURSE) and group (GROUP)
  // materials stay visible. Radionice have no modules → no module restriction.
  const visibleModuleIds = !isCustom && activeModule ? [activeModule.id] : []

  const materials = await db.material.findMany({
    where: buildEffectiveMaterialsWhere({
      scheduledGroupId: group.id,
      courseId: group.course.id,
      courseIsCustom: isCustom,
      moduleIds: visibleModuleIds,
    }),
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const moduleBuckets = new Map<string, KindBuckets>()
  const programMaterials = emptyBuckets()
  const groupMaterials = emptyBuckets()
  const radionicaMaterials = emptyBuckets()

  for (const m of materials) {
    const item = toItem(m)
    const kind = kindOf(m)

    if (m.scope === 'MODULE' && m.moduleId) {
      let bucket = moduleBuckets.get(m.moduleId)
      if (!bucket) {
        bucket = emptyBuckets()
        moduleBuckets.set(m.moduleId, bucket)
      }
      bucket[kind].push(item)
    } else if (isCustom) {
      // Radionica: COURSE + GROUP both fold into one flat bucket (no modules).
      radionicaMaterials[kind].push(item)
    } else if (m.scope === 'COURSE') {
      programMaterials[kind].push(item)
    } else {
      groupMaterials[kind].push(item)
    }
  }

  // Only the active module is shown to kids (and in the staff preview).
  const moduleSections: ModuleMaterialGroup[] =
    !isCustom && activeModule
      ? [
          {
            moduleId: activeModule.id,
            title: activeModule.title,
            sortOrder: activeModule.sortOrder,
            isActive: true,
            buckets: moduleBuckets.get(activeModule.id) ?? emptyBuckets(),
          },
        ]
      : []

  const featuredRobocamp = isCustom
    ? radionicaMaterials.robocamp
    : activeModule
      ? moduleBuckets.get(activeModule.id)?.robocamp ?? []
      : []

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
        isCustom,
      },
      location: { name: group.location.name },
      teacherNames: group.teacherAssignments.map(
        (t) => `${t.user.firstName} ${t.user.lastName}`,
      ),
    },
    featuredRobocamp,
    moduleSections,
    programMaterials,
    groupMaterials,
    radionicaMaterials,
    activeModuleId: activeModule?.id ?? null,
  }
}
