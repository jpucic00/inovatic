'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { AdminActionResult } from '@/lib/action-types'
import { AddCommentForm } from '@/components/shared/add-comment-form'
import { CommentList, type CommentListItem } from '@/components/shared/comment-list'

export type AdminCommentsPanelSection = {
  groupId: string
  groupLabel: string
  schoolYear: string
  modules: { id: string; title: string }[]
  attendance: { present: number; absent: number; total: number } | null
  comments: CommentListItem[]
  currentlyEnrolled: boolean
}

export type AdminCommentsPanelTab = {
  schoolYear: string
  sections: AdminCommentsPanelSection[]
}

type TypeFilter = 'ALL' | 'COMMENT' | 'MODULE_REVIEW'

interface Props {
  studentId: string
  tabs: AdminCommentsPanelTab[]
  onCreate: (input: {
    studentId: string
    groupId: string
    content: string
    type: 'COMMENT' | 'MODULE_REVIEW'
    moduleId?: string
  }) => Promise<AdminActionResult>
  onDelete: (commentId: string) => Promise<AdminActionResult>
}

export function StudentCommentsPanel({
  studentId,
  tabs,
  onCreate,
  onDelete,
}: Readonly<Props>) {
  const [activeYear, setActiveYear] = useState(tabs[0]?.schoolYear ?? '')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')

  const activeTab = useMemo(
    () => tabs.find((t) => t.schoolYear === activeYear) ?? tabs[0] ?? null,
    [tabs, activeYear],
  )

  if (!activeTab) {
    return <p className="text-sm text-gray-400 italic">Nema bilješki.</p>
  }

  return (
    <div>
      {tabs.length > 1 ? (
        <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
          {tabs.map((t) => {
            const isActive = t.schoolYear === activeTab.schoolYear
            const count = t.sections.reduce(
              (n, s) => n + s.comments.length,
              0,
            )
            return (
              <button
                key={t.schoolYear}
                type="button"
                onClick={() => setActiveYear(t.schoolYear)}
                className={[
                  'px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-cyan-600 text-cyan-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                ].join(' ')}
              >
                {t.schoolYear} ({count})
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <span className="text-gray-500">Filter:</span>
        {(['ALL', 'COMMENT', 'MODULE_REVIEW'] as const).map((value) => {
          const label =
            value === 'ALL'
              ? 'Sve'
              : value === 'COMMENT'
                ? 'Komentari'
                : 'Ocjene modula'
          const isActive = typeFilter === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value)}
              className={[
                'px-2.5 py-1 rounded-full border transition-colors',
                isActive
                  ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300',
              ].join(' ')}
            >
              {label}
            </button>
          )
        })}
      </div>

      {activeTab.sections.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          Nema grupa za školsku godinu {activeTab.schoolYear}.
        </p>
      ) : (
        <div className="space-y-6">
          {activeTab.sections.map((section) => {
            const visible = section.comments.filter(
              (c) => typeFilter === 'ALL' || c.type === typeFilter,
            )
            return (
              <section
                key={section.groupId}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <header className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {section.groupLabel}
                      {!section.currentlyEnrolled ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-gray-200 text-gray-500">
                          Bivša grupa
                        </span>
                      ) : null}
                    </p>
                    {section.attendance ? (
                      <AttendanceSummary
                        present={section.attendance.present}
                        absent={section.attendance.absent}
                        total={section.attendance.total}
                      />
                    ) : null}
                  </div>
                  <Link
                    href={`/admin/grupe/${section.groupId}`}
                    className="text-xs text-cyan-700 hover:underline"
                  >
                    Otvori grupu →
                  </Link>
                </header>

                {section.currentlyEnrolled ? (
                  <div className="mb-4 p-3 rounded-md bg-white border border-gray-200">
                    <AddCommentForm
                      groupId={section.groupId}
                      fixedStudentId={studentId}
                      modules={section.modules}
                      onSubmit={onCreate}
                    />
                  </div>
                ) : null}

                <CommentList
                  comments={visible}
                  onDelete={onDelete}
                  emptyText={
                    typeFilter === 'ALL'
                      ? 'Nema bilješki za ovu grupu.'
                      : 'Nema stavki koje zadovoljavaju filter.'
                  }
                />
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AttendanceSummary({
  present,
  absent,
  total,
}: Readonly<{ present: number; absent: number; total: number }>) {
  if (total === 0) return null
  return (
    <p className="text-xs text-gray-500 mt-1">
      Dolazak: <span className="font-medium text-emerald-700">{present}</span>
      {' / '}
      {total} ({absent} odsutan)
    </p>
  )
}
