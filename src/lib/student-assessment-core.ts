import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import type { AssessmentInput } from '@/lib/validators/admin/student-assessment'

/** Thrown when an assessment is attempted on a radionica (isCustom) group. */
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
 * data-level invariants: grading exists ONLY for standard programs (radionice are
 * skipped), and a COURSE recommendation must reference a real standard SLR course.
 */
export async function upsertStudentAssessment(
  input: AssessmentInput,
  authorId: string,
): Promise<void> {
  const group = await db.scheduledGroup.findUnique({
    where: { id: input.groupId },
    select: { course: { select: { isCustom: true } } },
  })
  if (!group) throw new AssessmentGroupNotFoundError()
  if (group.course.isCustom) throw new RadionicaNotGradableError()

  if (input.recommendationKind === 'COURSE') {
    if (!input.recommendedCourseId) throw new InvalidRecommendationError()
    const course = await db.course.findFirst({
      where: {
        id: input.recommendedCourseId,
        isCustom: false,
        level: { not: null },
      },
      select: { id: true },
    })
    if (!course) throw new InvalidRecommendationError()
  }

  const payload = {
    slaganje: input.slaganje ?? null,
    programiranje: input.programiranje ?? null,
    inovacije: input.inovacije ?? null,
    suradnja: input.suradnja ?? null,
    komunikacija: input.komunikacija ?? null,
    zabava: input.zabava ?? null,
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
