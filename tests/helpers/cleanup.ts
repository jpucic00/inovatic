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
 * or any real dev data — see {@link newRunId} for why that claim now holds.
 */
import { db } from '@/lib/db'

/**
 * Remove these groups and everything hanging off them, in FK order.
 *
 * Shared by the per-run teardown and by `20-bootstrap`, which cannot use a run
 * id: its two groups are named `Test Grupa A`/`Test Grupa B` because downstream
 * specs look them up by name, so every run created a fresh pair on top of the
 * last and nothing ever removed the old one. The fixture file points at the
 * newest pair, which is what kept that invisible.
 *
 * The order is the whole content of this function: TeacherAttendance →
 * ScheduledGroup is RESTRICT (payout evidence), as are Material, the comments,
 * the assessments and Enrollment, while Inquiry merely points at a group and has
 * to let go before it can be removed.
 */
export async function deleteGroupsAndDependents(groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return
  const inGroup = { in: groupIds }

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

    await deleteGroupsAndDependents(groupIds)

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

    // Everything the run's own staff AUTHORED, before the accounts themselves.
    //
    // The group sweep above only reaches rows on groups this run named, and a
    // fixture teacher routinely acts on the SHARED phase3 fixture group instead
    // — it is the one every spec seeds into, and its name carries no run id. So
    // a material uploaded or a comment written there survived the sweep, and
    // every one of these columns is a required relation, i.e. RESTRICT: the
    // `user.deleteMany` below then failed with P2003 and, because this helper
    // swallows, failed silently. That left the run's teachers behind for good —
    // the exact accumulation this teardown exists to stop.
    const users = await db.user.findMany({
      where: { OR: [{ email: like }, { username: like }] },
      select: { id: true },
    })
    if (users.length > 0) {
      const byUser = { in: users.map((u) => u.id) }
      await db.material.deleteMany({ where: { uploadedById: byUser } })
      await db.galleryImage.deleteMany({ where: { uploadedById: byUser } })
      await db.studentComment.deleteMany({ where: { authorId: byUser } })
      await db.studentAssessment.deleteMany({ where: { authorId: byUser } })
      await db.attendance.deleteMany({ where: { recordedById: byUser } })
      await db.teacherAttendance.deleteMany({
        where: { OR: [{ userId: byUser }, { recordedById: byUser }] },
      })
      await db.article.deleteMany({ where: { authorId: byUser } })
      await db.emailCampaign.deleteMany({ where: { sentById: byUser } })
      await db.teacherAssignment.deleteMany({ where: { userId: byUser } })
      // Enrollment cascades from User, and its own children (Attendance,
      // ModuleEnrollment, EnrollmentMonth) cascade from it — so the account
      // delete carries them, and only the RESTRICT edges above needed clearing.
      await db.user.deleteMany({ where: { id: byUser } })
    }
    await db.location.deleteMany({ where: { name: like } })
  } catch (err) {
    // Never fail a run on teardown — a leftover row is a smaller problem than a
    // green suite reported as broken.
    console.error(`cleanupRunFixtures(${runId}) failed:`, err)
  }
}

/**
 * A per-run id that is unique for real, and short enough to sit inside a name,
 * an e-mail local part and a Croatian surname without looking absurd.
 *
 * The old form was `Date.now().toString().slice(-6)`, which is the low six
 * digits of a millisecond clock and therefore **wraps every 16.7 minutes** —
 * `.slice(-8)` wraps every 27.7 hours. Two runs that collide share fixtures, and
 * the first one to finish deletes the other's rows out from under it. That was
 * survivable only because `workers: 1` makes runs sequential, but this module's
 * whole safety argument is "matching on the id can never reach another run", and
 * a wrapping clock does not support it.
 *
 * Base-36 milliseconds plus a random block: no wrap this century, and the random
 * half is what makes two runs started in the same millisecond distinct — which
 * is the case a timestamp alone can never cover, however wide.
 */
export function newRunId(): string {
  const stamp = Date.now().toString(36)
  const rand = Math.floor(Math.random() * 36 ** 3)
    .toString(36)
    .padStart(3, '0')
  return `${stamp}${rand}`
}
