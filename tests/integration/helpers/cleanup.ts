/**
 * Deterministic teardown for the integration tier.
 *
 * Every file in this tier runs serially against the same `inovatic_test`
 * database, so whatever one leaves behind is the next one's starting state.
 * Two teardown shapes live here, both ordered so each RESTRICT child is gone
 * before its parent:
 *
 * - `fixtureScope()` — scoped teardown, the default choice. A file that deletes
 *   only the ids it created can never take a neighbour's fixtures down with
 *   it, so a failure stays attributable to the file that caused it.
 * - `wipePlanningTables()` — the FK-safe global wipe, for the few files whose
 *   subject reads a whole table. The school-year planner walks *every*
 *   standard course, so a single stray 3-module course left by any other file
 *   fails it; those files genuinely need an empty slate. Reach for this only
 *   when the action under test is itself global — a global `deleteMany({})` is
 *   the order-dependency hazard, not the cure.
 *
 * The RESTRICT edges below are the whole reason order matters (everything else
 * in this graph is CASCADE or SET NULL and needs no explicit delete):
 *
 *   Course         ← Material.courseId, ScheduledGroup.courseId
 *   CourseModule   ← Material.moduleId
 *   ScheduledGroup ← Enrollment, Material.scheduledGroupId,
 *                    StudentComment.groupId, StudentAssessment.groupId
 *   Location       ← ScheduledGroup(locationId, city)
 */
import { db } from '@/lib/db'
import { createCourse, createGroup, createLocation } from './factory'

/** Groups plus every row that RESTRICT-blocks their removal. */
async function deleteGroupsDeep(groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return
  const ids = { in: groupIds }
  await db.material.deleteMany({ where: { scheduledGroupId: ids } })
  await db.studentComment.deleteMany({ where: { groupId: ids } })
  await db.studentAssessment.deleteMany({ where: { groupId: ids } })
  // Cascades Attendance + ModuleEnrollment.
  await db.enrollment.deleteMany({ where: { scheduledGroupId: ids } })
  await db.scheduledGroup.deleteMany({ where: { id: ids } })
}

/**
 * Courses plus their groups and their COURSE-/MODULE-scoped materials. Modules,
 * module schedules and enrollment windows cascade with the course; inquiries,
 * report-card recommendations and email campaigns pointing at it are SET NULL.
 */
async function deleteCoursesDeep(courseIds: string[]): Promise<void> {
  if (courseIds.length === 0) return
  const ids = { in: courseIds }
  const groups = await db.scheduledGroup.findMany({
    where: { courseId: ids },
    select: { id: true },
  })
  await deleteGroupsDeep(groups.map((g) => g.id))
  const modules = await db.courseModule.findMany({
    where: { courseId: ids },
    select: { id: true },
  })
  await db.material.deleteMany({
    where: {
      OR: [{ courseId: ids }, { moduleId: { in: modules.map((m) => m.id) } }],
    },
  })
  await db.course.deleteMany({ where: { id: ids } })
}

/** Venues plus any group still standing at them. */
async function deleteLocationsDeep(locationIds: string[]): Promise<void> {
  if (locationIds.length === 0) return
  const groups = await db.scheduledGroup.findMany({
    where: { locationId: { in: locationIds } },
    select: { id: true },
  })
  await deleteGroupsDeep(groups.map((g) => g.id))
  await db.location.deleteMany({ where: { id: { in: locationIds } } })
}

/**
 * Empties the whole course/group/venue graph plus the holiday calendar,
 * child-first. Safe whatever an earlier file left behind — that is the point:
 * an FK error raised in a cleanup hook fails every remaining test in the file
 * and reads as a regression in whatever was touched last.
 */
export async function wipePlanningTables(): Promise<void> {
  await db.material.deleteMany({})
  await db.studentComment.deleteMany({})
  await db.studentAssessment.deleteMany({})
  await db.enrollment.deleteMany({})
  await db.scheduledGroup.deleteMany({})
  await db.course.deleteMany({})
  await db.location.deleteMany({})
  await db.schoolYearHoliday.deleteMany({})
}

/**
 * Records the courses, groups and venues a file creates so its teardown can
 * name them. Use the wrappers in place of the bare factory calls, and hand any
 * row a server action created to the matching `track*`.
 */
export function fixtureScope() {
  const courseIds = new Set<string>()
  const groupIds = new Set<string>()
  const locationIds = new Set<string>()

  function trackCourse<T extends { id: string }>(course: T): T {
    courseIds.add(course.id)
    return course
  }

  function trackLocation<T extends { id: string }>(location: T): T {
    locationIds.add(location.id)
    return location
  }

  /** Also records the group's course + venue — `createGroup` mints both when omitted. */
  function trackGroup<T extends { id: string; courseId: string; locationId: string }>(
    group: T,
  ): T {
    groupIds.add(group.id)
    courseIds.add(group.courseId)
    locationIds.add(group.locationId)
    return group
  }

  return {
    trackCourse,
    trackGroup,
    trackLocation,
    course: async (overrides?: Parameters<typeof createCourse>[0]) =>
      trackCourse(await createCourse(overrides)),
    location: async (overrides?: Parameters<typeof createLocation>[0]) =>
      trackLocation(await createLocation(overrides)),
    group: async (overrides?: Parameters<typeof createGroup>[0]) =>
      trackGroup(await createGroup(overrides)),
    /** Deletes everything recorded above, child-first. Ids already gone are a no-op. */
    async cleanup(): Promise<void> {
      await deleteGroupsDeep([...groupIds])
      await deleteCoursesDeep([...courseIds])
      await deleteLocationsDeep([...locationIds])
      groupIds.clear()
      courseIds.clear()
      locationIds.clear()
    },
  }
}
