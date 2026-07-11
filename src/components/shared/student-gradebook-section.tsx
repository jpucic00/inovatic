'use client'

import type { AdminActionResult } from '@/lib/action-types'
import type { RecommendationOption } from '@/lib/assessment-rubric'
import type {
  AssessmentSaveInput,
  GradebookSection,
} from '@/lib/student-assessment-view'
import { AssessmentCard } from './assessment-card'
import { AddCommentForm } from './add-comment-form'
import { CommentList } from './comment-list'

interface Props {
  studentId: string
  sections: GradebookSection[]
  recommendationOptions: RecommendationOption[]
  onSaveAssessment: (input: AssessmentSaveInput) => Promise<AdminActionResult>
  onClearAssessment: (input: {
    studentId: string
    groupId: string
  }) => Promise<AdminActionResult>
  onCreateComment: (input: {
    studentId: string
    groupId: string
    content: string
  }) => Promise<AdminActionResult>
  onDeleteComment: (commentId: string) => Promise<AdminActionResult>
}

export function StudentGradebookSection({
  studentId,
  sections,
  recommendationOptions,
  onSaveAssessment,
  onClearAssessment,
  onCreateComment,
  onDeleteComment,
}: Readonly<Props>) {
  if (sections.length === 0) {
    return (
      <p className="text-sm italic text-gray-400">
        Nema grupa za ovu školsku godinu.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section
          key={section.groupId}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-4"
        >
          {/* Group context — identifies the block for both notes and grades */}
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {section.program}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Grupa: {section.groupLabel}
              {section.teacherNames.length > 0
                ? ` · Predavač: ${section.teacherNames.join(', ')}`
                : ''}
            </p>
          </div>

          {/* Bilješke first — notes are kept all year round. */}
          <div className="border-t border-gray-100 pt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Bilješke
            </h4>
            {section.canComment ? (
              <div className="mb-3">
                <AddCommentForm
                  groupId={section.groupId}
                  studentId={studentId}
                  onSubmit={onCreateComment}
                />
              </div>
            ) : null}
            <CommentList
              comments={section.comments}
              onDelete={onDeleteComment}
              emptyText="Nema bilješki za ovu grupu."
            />
          </div>

          {/* Ocjena below — the report card is filled in at the end of the year. */}
          {section.canGrade ? (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ocjena
              </h4>
              <AssessmentCard
                studentId={studentId}
                groupId={section.groupId}
                initial={section.assessment}
                recommendationOptions={recommendationOptions}
                onSave={onSaveAssessment}
                onClear={onClearAssessment}
              />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}
