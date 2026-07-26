'use server'

import { notFound } from 'next/navigation'
import type { SkillLevel } from '@prisma/client'
import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'
import { formatRecommendationLabel } from '@/lib/assessment-rubric'

/**
 * The report card as the parent/polaznik sees it. Ids are resolved to display
 * strings here so none reach the portal. Internal `StudentComment` notes are
 * deliberately NOT part of this shape — bilješke stay staff-only.
 */
export type StudentAssessmentReadonly = {
  slaganje: SkillLevel | null
  programiranje: SkillLevel | null
  inovacije: SkillLevel | null
  suradnja: SkillLevel | null
  komunikacija: SkillLevel | null
  zabava: SkillLevel | null
  opisnaOcjena: string | null
  recommendationLabel: string | null
  updatedAt: Date
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
      course: { select: { title: true, isCustom: true } },
    },
  })
  if (!group) notFound()

  const view: StudentAssessmentView = {
    group: { id: group.id, name: group.name, courseTitle: group.course.title },
    gradable: !group.course.isCustom,
    assessment: null,
  }
  if (!view.gradable) return view

  const row = await db.studentAssessment.findUnique({
    where: {
      studentId_groupId: { studentId: session.user.id, groupId },
    },
    select: {
      slaganje: true,
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

  const skills = [
    row.slaganje,
    row.programiranje,
    row.inovacije,
    row.suradnja,
    row.komunikacija,
    row.zabava,
  ]
  const isBlank =
    skills.every((s) => s === null) &&
    !row.opisnaOcjena?.trim() &&
    row.recommendationKind === null
  if (isBlank) return view

  return {
    ...view,
    assessment: {
      slaganje: row.slaganje,
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
      updatedAt: row.updatedAt,
      authorName: `${row.author.firstName} ${row.author.lastName}`.trim(),
    },
  }
}
