import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { SkillLevel } from '@prisma/client'
import { isGradable } from '@/lib/program-kind'
import { SKILL_KEYS, skillKeysFor, type SkillKey } from '@/lib/assessment-rubric'
import type { AssessmentInput } from '@/lib/validators/admin/student-assessment'

/** Thrown when an assessment is attempted on a radionica group. */
class RadionicaNotGradableError extends Error {}
/** Thrown when a COURSE recommendation points at a non-standard/absent course. */
class InvalidRecommendationError extends Error {}
/** Thrown when the target group no longer exists. */
class AssessmentGroupNotFoundError extends Error {}

function revalidateStudent(studentId: string): void {
  revalidatePath(`/admin/ucenici/${studentId}`)
  revalidatePath(`/nastavnik/ucenik/${studentId}`)
}

/**
 * Upserts the single report card for (student, group). City/ownership scoping is
 * the caller's responsibility (admin vs teacher action). Here we enforce the two
 * data-level invariants: radionice are never graded (competition groups are, just
 * like standard ones), and a COURSE recommendation must reference a real standard
 * SLR course — never a radionica, and never the competitive program, which is
 * offered as its own special track instead.
 */
export async function upsertStudentAssessment(
  input: AssessmentInput,
  authorId: string,
): Promise<void> {
  const group = await db.scheduledGroup.findUnique({
    where: { id: input.groupId },
    select: { course: { select: { kind: true } } },
  })
  if (!group) throw new AssessmentGroupNotFoundError()
  if (!isGradable(group.course.kind)) throw new RadionicaNotGradableError()

  if (input.recommendationKind === 'COURSE') {
    if (!input.recommendedCourseId) throw new InvalidRecommendationError()
    const course = await db.course.findFirst({
      where: {
        id: input.recommendedCourseId,
        kind: 'STANDARD',
        level: { not: null },
      },
      select: { id: true },
    })
    if (!course) throw new InvalidRecommendationError()
  }

  // Only the skills this group's rubric actually has are stored; anything else
  // the client sent is nulled rather than trusted. That is what keeps a column
  // honest — `slaganje` on a competition row would otherwise hold whatever a
  // stale form posted, and no reader could tell.
  const allowed = new Set(skillKeysFor(group.course.kind))
  const skills = Object.fromEntries(
    SKILL_KEYS.map((key) => [key, allowed.has(key) ? (input[key] ?? null) : null]),
  ) as Record<SkillKey, SkillLevel | null>

  const payload = {
    ...skills,
    opisnaOcjena: input.opisnaOcjena ?? null,
    recommendationKind: input.recommendationKind ?? null,
    recommendedCourseId:
      input.recommendationKind === 'COURSE'
        ? (input.recommendedCourseId ?? null)
        : null,
  }

  await db.studentAssessment.upsert({
    where: {
      studentId_groupId: {
        studentId: input.studentId,
        groupId: input.groupId,
      },
    },
    create: {
      studentId: input.studentId,
      groupId: input.groupId,
      authorId,
      ...payload,
    },
    update: { authorId, ...payload },
  })

  revalidateStudent(input.studentId)
}

/** Deletes the report card for (student, group). Idempotent — no-op if absent. */
export async function clearStudentAssessment(
  studentId: string,
  groupId: string,
): Promise<void> {
  await db.studentAssessment.deleteMany({ where: { studentId, groupId } })
  revalidateStudent(studentId)
}

/** Maps a core error to a Croatian message for AdminActionResult. */
export function assessmentErrorMessage(err: unknown): string {
  if (err instanceof RadionicaNotGradableError) return 'Radionice se ne ocjenjuju.'
  if (err instanceof InvalidRecommendationError)
    return 'Preporuka nije ispravno postavljena.'
  if (err instanceof AssessmentGroupNotFoundError)
    return 'Grupa nije pronađena.'
  return 'Greška pri spremanju ocjene.'
}
