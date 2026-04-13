'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createComment } from '@/actions/admin/student-comment'
import { toast } from 'sonner'

interface GroupOption {
  id: string
  name: string | null
  courseName: string
}

interface AddCommentFormProps {
  studentId: string
  groups: GroupOption[]
}

export function AddCommentForm({
  studentId,
  groups,
}: Readonly<AddCommentFormProps>) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
  const [content, setContent] = useState('')
  const [type, setType] = useState<'COMMENT' | 'MODULE_REVIEW'>('COMMENT')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || !groupId) return

    startTransition(async () => {
      const result = await createComment({
        studentId,
        groupId,
        content: content.trim(),
        type,
      })
      if (result.success) {
        toast.success('Bilješka dodana.')
        setContent('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri dodavanju.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-3">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-md bg-white text-gray-700"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name ?? g.courseName}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="radio"
              name="commentType"
              value="COMMENT"
              checked={type === 'COMMENT'}
              onChange={() => setType('COMMENT')}
              className="h-3.5 w-3.5"
            />
            Komentar
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="radio"
              name="commentType"
              value="MODULE_REVIEW"
              checked={type === 'MODULE_REVIEW'}
              onChange={() => setType('MODULE_REVIEW')}
              className="h-3.5 w-3.5"
            />
            Ocjena modula
          </label>
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Dodaj bilješku o učeniku..."
        rows={3}
        maxLength={2000}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
      />

      <button
        type="submit"
        disabled={isPending || !content.trim() || !groupId}
        className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Dodajem...' : 'Dodaj bilješku'}
      </button>
    </form>
  )
}
