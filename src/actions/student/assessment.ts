'use server'

import { notFound } from 'next/navigation'
import type { ProgramKind, SkillLevel } from '@prisma/client'
import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'
import { formatRecommendationLabel, isBlankAssessment } from '@/lib/assessment-rubric'
import { formatDate } from '@/lib/format'
import { isGradable } from '@/lib/program-kind'

/**
 * The report card as the parent/polaznik sees it. Ids are resolved to display
 * strings here so none reach the portal. Internal `StudentComment` notes are
 * deliberately NOT part of this shape — bilješke stay staff-only.
 */
export type StudentAssessmentReadonly = {
  slaganje: SkillLevel | null
  programiranje: SkillLevel | null
  razradaIdeja: SkillLevel | null
  izvedivost: SkillLevel | null
  inovacije: SkillLevel | null
  suradnja: SkillLevel | null
  komunikacija: SkillLevel | null
  zabava: SkillLevel | null
  opisnaOcjena: string | null
  recommendationLabel: string | null
  /** Formatted here, not shipped as a Date: server actions return serializable
   * values only, and the consumer was already re-wrapping it in `new Date()`. */
  updatedAtLabel: string
  authorName: string
}

type StudentAssessmentView = {
  group: {
    id: string
    name: string | null
    courseTitle: string
  }
  /** Radionice are never graded — the page shows a notice instead of a card. */
  gradable: boolean
  /** Which rubric the card renders — the practical skills differ by kind. */
  kind: ProgramKind
  assessment: StudentAssessmentReadonly | null
}

/**
 * Read-only report card for a group the logged-in student is enrolled in.
 * The enrollment lookup is the access gate: someone else's group 404s, which is
 * indistinguishable from a nonexistent one. A row whose every field is still
 * blank counts as "not graded yet" so a parent never opens an empty card.
 */
export async function getMyAssessmentForGroup(
  groupId: string,
): Promise<StudentAssessmentView> {
  const session = await requireStudent()

  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, scheduledGroupId: groupId },
    select: { id: true },
  })
  if (!enrollment) notFound()

  const group = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      course: { select: { title: true, kind: true } },
    },
  })
  if (!group) notFound()

  const view: StudentAssessmentView = {
    group: { id: group.id, name: group.name, courseTitle: group.course.title },
    gradable: isGradable(group.course.kind),
    kind: group.course.kind,
    assessment: null,
  }
  if (!view.gradable) return view

  const row = await db.studentAssessment.findUnique({
    where: {
      studentId_groupId: { studentId: session.user.id, groupId },
    },
    select: {
      slaganje: true,
      razradaIdeja: true,
      izvedivost: true,
      programiranje: true,
      inovacije: true,
      suradnja: true,
      komunikacija: true,
      zabava: true,
      opisnaOcjena: true,
      recommendationKind: true,
      updatedAt: true,
      recommendedCourse: { select: { title: true } },
      author: { select: { firstName: true, lastName: true } },
    },
  })
  if (!row) return view

  if (isBlankAssessment(row)) return view

  return {
    ...view,
    assessment: {
      slaganje: row.slaganje,
      razradaIdeja: row.razradaIdeja,
      izvedivost: row.izvedivost,
      programiranje: row.programiranje,
      inovacije: row.inovacije,
      suradnja: row.suradnja,
      komunikacija: row.komunikacija,
      zabava: row.zabava,
      opisnaOcjena: row.opisnaOcjena,
      recommendationLabel: row.recommendationKind
        ? formatRecommendationLabel(
            row.recommendationKind,
            row.recommendedCourse?.title ?? null,
          )
        : null,
      updatedAtLabel: formatDate(row.updatedAt),
      authorName: `${row.author.firstName} ${row.author.lastName}`.trim(),
    },
  }
}
