import { notFound } from 'next/navigation'
import type { Material, MaterialType, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { isRadionica, showsAllModules } from '@/lib/program-kind'
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
    course: { id: string; title: string; kind: ProgramKind }
    location: { name: string }
    teacherNames: string[]
  }
  /** Active-module RoboCamp tutorials, surfaced at the very top of the page. */
  featuredRobocamp: MaterialItem[]
  /**
   * Per-module sections. Standard programs get exactly one (the module the
   * group is working on now); COMPETITION programs get one per natjecanje, all
   * of them, all year. Empty for radionice.
   */
  moduleSections: ModuleMaterialGroup[]
  /** COURSE-scoped materials ("for the whole program"). Empty for radionice. */
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

type MaterialPartition = {
  moduleBuckets: Map<string, KindBuckets>
  programMaterials: KindBuckets
  groupMaterials: KindBuckets
  radionicaMaterials: KindBuckets
}

/**
 * Sort every material into its display bucket: MODULE-scoped rows group by
 * moduleId; on a radionica everything else folds into one flat bucket; on a
 * program with modules COURSE-scoped rows go to the program bucket and the rest
 * to the group bucket.
 */
function partitionMaterials(
  materials: Material[],
  kind: ProgramKind,
): MaterialPartition {
  const moduleBuckets = new Map<string, KindBuckets>()
  const programMaterials = emptyBuckets()
  const groupMaterials = emptyBuckets()
  const radionicaMaterials = emptyBuckets()

  for (const m of materials) {
    const item = toItem(m)
    const bucketKind = kindOf(m)

    if (m.scope === 'MODULE' && m.moduleId) {
      let bucket = moduleBuckets.get(m.moduleId)
      if (!bucket) {
        bucket = emptyBuckets()
        moduleBuckets.set(m.moduleId, bucket)
      }
      bucket[bucketKind].push(item)
    } else if (isRadionica(kind)) {
      // Radionica: COURSE + GROUP both fold into one flat bucket (no modules).
      radionicaMaterials[bucketKind].push(item)
    } else if (m.scope === 'COURSE') {
      programMaterials[bucketKind].push(item)
    } else {
      groupMaterials[bucketKind].push(item)
    }
  }

  return { moduleBuckets, programMaterials, groupMaterials, radionicaMaterials }
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

  const kind = group.course.kind
  const allModules = showsAllModules(kind)
  // Pacing follows the group's own city: its holiday calendar and its city's
  // module schedule rows (the resolver ignores the other city's schedules).
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

  const materials = await db.material.findMany({
    where: buildEffectiveMaterialsWhere({
      scheduledGroupId: group.id,
      courseId: group.course.id,
      moduleIds: visibleModuleIds,
    }),
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const { moduleBuckets, programMaterials, groupMaterials, radionicaMaterials } =
    partitionMaterials(materials, kind)

  let moduleSections: ModuleMaterialGroup[] = []
  if (allModules) {
    // Every natjecanje, in sortOrder. None is "active" — the season runs them
    // all in parallel — so the UI must not highlight one over the others.
    moduleSections = group.course.modules.map((m) => ({
      moduleId: m.id,
      title: m.title,
      sortOrder: m.sortOrder,
      isActive: false,
      buckets: moduleBuckets.get(m.id) ?? emptyBuckets(),
    }))
  } else if (activeModule) {
    moduleSections = [
      {
        moduleId: activeModule.id,
        title: activeModule.title,
        sortOrder: activeModule.sortOrder,
        isActive: true,
        buckets: moduleBuckets.get(activeModule.id) ?? emptyBuckets(),
      },
    ]
  }

  let featuredRobocamp: MaterialItem[] = []
  if (isRadionica(kind)) {
    featuredRobocamp = radionicaMaterials.robocamp
  } else if (allModules) {
    featuredRobocamp = moduleSections.flatMap((s) => s.buckets.robocamp)
  } else if (activeModule) {
    featuredRobocamp = moduleBuckets.get(activeModule.id)?.robocamp ?? []
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
