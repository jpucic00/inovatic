import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Material, MaterialType, ProgramKind } from '@prisma/client'
import { db } from '@/lib/db'
import { isRadionica, showsAllModules } from '@/lib/program-kind'
import { computeSchoolYear } from '@/lib/school-year'
import { buildEffectiveMaterialsWhere } from '@/lib/material-query'
import { getCurrentActiveModuleForGroup } from '@/lib/active-module'
import { loadHolidayDateKeys } from '@/lib/holidays'
import { displayKindOf, kindOf, EXTRA_KIND_ORDER } from '@/lib/material-display'

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

type InteractiveGuide = {
  item: MaterialItem
  /** Which module the guide belongs to, when the program has modules. */
  moduleTitle: string | null
}

/**
 * Every RoboCamp guide a group can see, each carrying its module's title.
 *
 * Deliberately gathers from ALL buckets, not just the module ones. A guide
 * attached at COURSE or GROUP scope is still a guide — and since the guide
 * section is the only place a RoboCamp row is rendered now, anything missed
 * here disappears from the page entirely rather than merely being demoted.
 * That is exactly what the old `featuredRobocamp` (module-scope only) would
 * have done to a programme-wide guide.
 */
export function interactiveGuides(view: GroupMaterialsView): InteractiveGuide[] {
  const guides: InteractiveGuide[] = view.moduleSections.flatMap((section) =>
    section.buckets.robocamp.map((item) => ({ item, moduleTitle: section.title })),
  )
  for (const bucket of [
    view.programMaterials,
    view.groupMaterials,
    view.radionicaMaterials,
  ]) {
    for (const item of bucket.robocamp) guides.push({ item, moduleTitle: null })
  }
  return guides
}

/**
 * Everything that is NOT an interactive guide, as ONE list.
 *
 * Where a material came from — this module, the whole program, or the group's
 * own extras — is deliberately dropped here. To a child that distinction means
 * nothing; what they need is to find the thing and know what kind it is, so the
 * list is ordered by kind instead and each row is labelled with its own. Staff
 * keep the scope: `StaffMaterialList` still groups and labels by it, because
 * for a teacher it decides whether a row can be edited, only hidden, or
 * neither.
 */
export function flattenExtraMaterials(view: GroupMaterialsView): MaterialItem[] {
  const buckets: KindBuckets[] = [
    ...view.moduleSections.map((s) => s.buckets),
    view.programMaterials,
    view.groupMaterials,
    view.radionicaMaterials,
  ]
  const all = buckets.flatMap((b) => [...b.videos, ...b.docs, ...b.links])

  return all.sort((a, b) => {
    const byKind =
      EXTRA_KIND_ORDER.indexOf(displayKindOf(a)) -
      EXTRA_KIND_ORDER.indexOf(displayKindOf(b))
    if (byKind !== 0) return byKind
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
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

export type GroupShell = {
  group: GroupMaterialsView['group']
  courseId: string
  kind: ProgramKind
  /** Every module of the course, in sortOrder. Empty for radionice. */
  modules: { id: string; title: string; sortOrder: number }[]
  /** The module this group is working through now — null for COMPETITION. */
  activeModule: { id: string; title: string; sortOrder: number } | null
  /** Modules whose materials this group may see at all. */
  visibleModuleIds: string[]
  schoolYear: string
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
    schoolYear,
  }
})

/**
 * Loads a group and computes the effective, kind-partitioned material view a
 * student sees — respecting per-group hides. Does NOT authorize the caller;
 * the caller (student enrollment gate, or staff ownership gate) must do that
 * first. Throws notFound() if the group does not exist.
 */
export async function buildGroupMaterialsView(groupId: string): Promise<GroupMaterialsView> {
  const shell = await buildGroupShell(groupId)
  const { kind, activeModule, visibleModuleIds, modules } = shell
  const allModules = showsAllModules(kind)

  const materials = await db.material.findMany({
    where: buildEffectiveMaterialsWhere({
      scheduledGroupId: shell.group.id,
      courseId: shell.courseId,
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
    moduleSections = modules.map((m) => ({
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

  return {
    group: shell.group,
    moduleSections,
    programMaterials,
    groupMaterials,
    radionicaMaterials,
    activeModuleId: activeModule?.id ?? null,
  }
}
