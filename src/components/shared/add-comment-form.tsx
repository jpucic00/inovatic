'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { AdminActionResult } from '@/lib/action-types'

interface Props {
  groupId: string
  studentId: string
  onSubmit: (input: {
    studentId: string
    groupId: string
    content: string
  }) => Promise<AdminActionResult>
}

export function AddCommentForm({
  groupId,
  studentId,
  onSubmit,
}: Readonly<Props>) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const canSubmit = !!content.trim() && !isPending

  const runSubmit = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await onSubmit({ studentId, groupId, content: content.trim() })
      if (result.success) {
        toast.success('Komentar dodan.')
        setContent('')
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
      className="space-y-2"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Napišite komentar o polazniku..."
        rows={2}
        maxLength={2000}
        className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
      >
        {isPending ? 'Dodajem...' : 'Dodaj komentar'}
      </button>
    </form>
  )
}
