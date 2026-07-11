import type { RecommendationKind, SkillLevel } from '@prisma/client'
import type { StudentDetail } from '@/lib/student-detail'
import type { CommentListItem } from '@/components/shared/comment-list'

export type AssessmentValue = {
  slaganje: SkillLevel | null
  programiranje: SkillLevel | null
  inovacije: SkillLevel | null
  suradnja: SkillLevel | null
  komunikacija: SkillLevel | null
  zabava: SkillLevel | null
  opisnaOcjena: string | null
  recommendationKind: RecommendationKind | null
  recommendedCourseId: string | null
  recommendedCourseTitle: string | null
  updatedAt: Date | string | null
  authorName: string | null
}

export type GradebookSection = {
  groupId: string
  schoolYear: string
  program: string // course title (Excel "PROGRAM")
  groupLabel: string // group name or weekday (Excel "GRUPA")
  teacherNames: string[] // Excel "PREDAVAČ"
  /** Standard program + a live enrollment → an editable report card is shown. */
  canGrade: boolean
  /** A live enrollment → the add-comment box is shown (comments are universal). */
  canComment: boolean
  assessment: AssessmentValue | null
  comments: CommentListItem[]
}

export type AssessmentSaveInput = {
  studentId: string
  groupId: string
  slaganje: SkillLevel | null
  programiranje: SkillLevel | null
  inovacije: SkillLevel | null
  suradnja: SkillLevel | null
  komunikacija: SkillLevel | null
  zabava: SkillLevel | null
  opisnaOcjena: string | null
  recommendationKind: RecommendationKind | null
  recommendedCourseId: string | null
}

export type GradebookYearTab = {
  schoolYear: string
  sections: GradebookSection[]
}

type SectionMeta = {
  groupId: string
  schoolYear: string
  isCustom: boolean
  hasEnrollment: boolean
  program: string
  groupLabel: string
  teacherNames: string[]
}

/**
 * Builds the year → per-group view model for the student gradebook. Groups are
 * the union of the student's enrollments and any group that still carries a
 * comment (enrollment removed) so nothing silently disappears. Year is taken
 * from the group. A report card is editable only for a standard program with a
 * live enrollment; radionice (isCustom) never show a card but keep comments.
 */
export function buildGradebookTabs(
  student: StudentDetail,
  canDelete: (authorId: string) => boolean,
): GradebookYearTab[] {
  const meta = new Map<string, SectionMeta>()

  for (const e of student.enrollments) {
    const sg = e.scheduledGroup
    meta.set(sg.id, {
      groupId: sg.id,
      schoolYear: e.schoolYear,
      isCustom: sg.course.isCustom,
      hasEnrollment: true,
      program: sg.course.title,
      groupLabel: sg.name ?? sg.dayOfWeek ?? '—',
      teacherNames: sg.teacherAssignments.map((ta) =>
        `${ta.user.firstName} ${ta.user.lastName}`.trim(),
      ),
    })
  }

  for (const c of student.studentComments) {
    if (meta.has(c.group.id)) continue
    meta.set(c.group.id, {
      groupId: c.group.id,
      schoolYear: c.group.schoolYear,
      isCustom: false, // unknown without an enrollment; irrelevant (hasEnrollment=false gates the card)
      hasEnrollment: false,
      program: c.group.course.title,
      groupLabel: c.group.name ?? '—',
      teacherNames: [],
    })
  }

  const commentsByGroup = new Map<string, CommentListItem[]>()
  for (const c of student.studentComments) {
    const item: CommentListItem = {
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      authorName: `${c.author.firstName} ${c.author.lastName}`.trim(),
      authorRole: c.author.role,
      authorDeleted: c.author.deletedAt != null,
      canDelete: canDelete(c.author.id),
    }
    const bucket = commentsByGroup.get(c.group.id) ?? []
    bucket.push(item)
    commentsByGroup.set(c.group.id, bucket)
  }

  const assessmentByGroup = new Map<string, AssessmentValue>()
  for (const a of student.studentAssessments) {
    assessmentByGroup.set(a.groupId, {
      slaganje: a.slaganje,
      programiranje: a.programiranje,
      inovacije: a.inovacije,
      suradnja: a.suradnja,
      komunikacija: a.komunikacija,
      zabava: a.zabava,
      opisnaOcjena: a.opisnaOcjena,
      recommendationKind: a.recommendationKind,
      recommendedCourseId: a.recommendedCourseId,
      recommendedCourseTitle: a.recommendedCourse?.title ?? null,
      updatedAt: a.updatedAt,
      authorName: `${a.author.firstName} ${a.author.lastName}`.trim(),
    })
  }

  const byYear = new Map<string, GradebookSection[]>()
  for (const m of meta.values()) {
    const canGrade = m.hasEnrollment && !m.isCustom
    const section: GradebookSection = {
      groupId: m.groupId,
      schoolYear: m.schoolYear,
      program: m.program,
      groupLabel: m.groupLabel,
      teacherNames: m.teacherNames,
      canGrade,
      canComment: m.hasEnrollment,
      // Radionice never carry a card, even if a stray row somehow exists.
      assessment: m.isCustom ? null : (assessmentByGroup.get(m.groupId) ?? null),
      comments: commentsByGroup.get(m.groupId) ?? [],
    }
    const bucket = byYear.get(m.schoolYear) ?? []
    bucket.push(section)
    byYear.set(m.schoolYear, bucket)
  }

  return Array.from(byYear.entries())
    .map(([schoolYear, sections]) => ({ schoolYear, sections }))
    .sort((a, b) => b.schoolYear.localeCompare(a.schoolYear))
}
