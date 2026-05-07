'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, MessageSquareText } from 'lucide-react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AdminActionResult } from '@/lib/action-types'

type CommentType = 'COMMENT' | 'MODULE_REVIEW'

type CommentModuleOption = {
  id: string
  title: string
}

type CommentStudentOption = {
  id: string
  label: string
}

interface Props {
  groupId: string
  onSubmit: (input: {
    studentId: string
    groupId: string
    content: string
    type: CommentType
    moduleId?: string
  }) => Promise<AdminActionResult>
  modules: CommentModuleOption[]
  studentOptions?: CommentStudentOption[]
  fixedStudentId?: string
}

export function AddCommentForm({
  groupId,
  onSubmit,
  modules,
  studentOptions,
  fixedStudentId,
}: Readonly<Props>) {
  const baseId = useId()
  const [studentId, setStudentId] = useState(
    fixedStudentId ?? studentOptions?.[0]?.id ?? '',
  )
  const [content, setContent] = useState('')
  const [type, setType] = useState<CommentType>('COMMENT')
  const [moduleId, setModuleId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isReview = type === 'MODULE_REVIEW'
  const showModulePicker = isReview && modules.length > 0
  const needsModule = showModulePicker && !moduleId

  const canSubmit = useMemo(
    () => !!content.trim() && !!studentId && !needsModule && !isPending,
    [content, studentId, needsModule, isPending],
  )

  const runSubmit = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await onSubmit({
        studentId,
        groupId,
        content: content.trim(),
        type,
        moduleId: showModulePicker && moduleId ? moduleId : undefined,
      })
      if (result.success) {
        toast.success(
          isReview ? 'Ocjena dodana.' : 'Komentar dodan.',
        )
        setContent('')
        setModuleId('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri dodavanju.')
      }
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        runSubmit()
      }}
      className={[
        'space-y-3 border-l-4 pl-4',
        isReview ? 'border-purple-200' : 'border-cyan-200',
      ].join(' ')}
    >
      {studentOptions ? (
        <div className="max-w-xs">
          <label
            htmlFor={`${baseId}-student`}
            className="block text-[11px] font-medium text-gray-500 mb-1"
          >
            Polaznik
          </label>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger id={`${baseId}-student`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {studentOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setType('COMMENT')}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            isReview
              ? 'text-gray-500 hover:text-gray-700'
              : 'bg-white text-cyan-700 shadow-sm',
          ].join(' ')}
        >
          <MessageSquareText className="w-4 h-4" />
          Komentar
        </button>
        <button
          type="button"
          onClick={() => setType('MODULE_REVIEW')}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            isReview
              ? 'bg-white text-purple-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          <GraduationCap className="w-4 h-4" />
          Ocjena modula
        </button>
      </div>

      {showModulePicker ? (
        <div className="max-w-xs">
          <label
            htmlFor={`${baseId}-module`}
            className="block text-[11px] font-medium text-gray-500 mb-1"
          >
            Modul <span className="text-red-400">*</span>
          </label>
          <Select value={moduleId} onValueChange={setModuleId}>
            <SelectTrigger id={`${baseId}-module`} className="w-full">
              <SelectValue placeholder="Odaberi modul..." />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={
          isReview
            ? 'Napišite ocjenu modula...'
            : 'Napišite komentar o polazniku...'
        }
        rows={3}
        maxLength={2000}
        className={[
          'w-full px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:border-transparent',
          isReview ? 'focus:ring-purple-500' : 'focus:ring-cyan-500',
        ].join(' ')}
      />

      <button
        type="submit"
        disabled={!canSubmit}
        className={[
          'px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50',
          isReview
            ? 'bg-purple-600 hover:bg-purple-700'
            : 'bg-cyan-600 hover:bg-cyan-700',
        ].join(' ')}
      >
        {(() => {
          if (isPending) return 'Dodajem...'
          return isReview ? 'Dodaj ocjenu' : 'Dodaj komentar'
        })()}
      </button>
    </form>
  )
}
