/**
 * Teardown for Playwright specs that create their fixtures through the admin UI.
 *
 * Those specs stamp a per-run `RUN_ID` into every name they type — group names,
 * course titles, parent e-mails — but several had no teardown, so each run left
 * its groups behind for good. The buildup is not cosmetic: `/admin/grupe` packs
 * every group of a weekday into one lane, and past ~25 leftovers the entries go
 * zero-width and assertions start failing on specs that never changed. Two of
 * those failures were chased as regressions before the cause was found.
 *
 * `cleanupRunFixtures(RUN_ID)` deletes everything carrying that id, children
 * first. It is best-effort by design — a teardown that throws would fail an
 * otherwise-green run and hide the real result — so it swallows and logs.
 *
 * Matching is on the id alone, so it can never reach a fixture from another run
 * (each RUN_ID is a fresh millisecond suffix) or any real dev data.
 */
import { db } from '@/lib/db'

/**
 * Delete every row a Playwright run created, in FK order.
 *
 * The RESTRICT edges are what makes the order load-bearing:
 * TeacherAttendance → ScheduledGroup (payout evidence), Material/comments →
 * group, Enrollment → group, group → Course, group → Location. Everything else
 * cascades or nulls.
 */
export async function cleanupRunFixtures(runId: string): Promise<void> {
  if (!runId) return
  const like = { contains: runId }
  const groupWhere = { OR: [{ name: like }, { course: { title: like } }] }

  try {
    const groups = await db.scheduledGroup.findMany({
      where: groupWhere,
      select: { id: true },
    })
    const groupIds = groups.map((g) => g.id)
    const inGroup = { in: groupIds }

    if (groupIds.length > 0) {
      await db.attendance.deleteMany({ where: { enrollment: { scheduledGroupId: inGroup } } })
      await db.moduleEnrollment.deleteMany({
        where: { enrollment: { scheduledGroupId: inGroup } },
      })
      await db.teacherAttendance.deleteMany({ where: { scheduledGroupId: inGroup } })
      await db.studentComment.deleteMany({ where: { groupId: inGroup } })
      await db.studentAssessment.deleteMany({ where: { groupId: inGroup } })
      await db.galleryImage.deleteMany({ where: { scheduledGroupId: inGroup } })
      await db.materialGroupHide.deleteMany({ where: { scheduledGroupId: inGroup } })
      await db.material.deleteMany({ where: { scheduledGroupId: inGroup } })
      await db.teacherAssignment.deleteMany({ where: { scheduledGroupId: inGroup } })
      await db.enrollment.deleteMany({ where: { scheduledGroupId: inGroup } })
      // Upiti point at a group; they must let go before it can be removed.
      await db.inquiry.deleteMany({ where: { scheduledGroupId: inGroup } })
      await db.inquiry.deleteMany({ where: { assignedGroupId: inGroup } })
      await db.scheduledGroup.deleteMany({ where: { id: inGroup } })
    }

    // Upiti a spec typed itself, identified by the run id in the e-mail or the
    // child's surname; a submitted form leaves one even when no group was picked.
    await db.inquiry.deleteMany({
      where: { OR: [{ parentEmail: like }, { childLastName: like }, { parentName: like }] },
    })

    const courses = await db.course.findMany({
      where: { OR: [{ title: like }, { slug: like }] },
      select: { id: true },
    })
    if (courses.length > 0) {
      const courseIds = { in: courses.map((c) => c.id) }
      const modules = await db.courseModule.findMany({
        where: { courseId: courseIds },
        select: { id: true },
      })
      await db.material.deleteMany({
        where: {
          OR: [{ courseId: courseIds }, { moduleId: { in: modules.map((m) => m.id) } }],
        },
      })
      // Modules, module schedules, seasons and enrollment windows cascade.
      await db.course.deleteMany({ where: { id: courseIds } })
    }

    await db.user.deleteMany({
      where: { OR: [{ email: like }, { username: like }] },
    })
    await db.location.deleteMany({ where: { name: like } })
  } catch (err) {
    // Never fail a run on teardown — a leftover row is a smaller problem than a
    // green suite reported as broken.
    console.error(`cleanupRunFixtures(${runId}) failed:`, err)
  }
}
