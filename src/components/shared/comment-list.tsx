'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import type { AdminActionResult } from '@/lib/action-types'
import type { UserRole } from '@prisma/client'

export type CommentListItem = {
  id: string
  content: string
  type: 'COMMENT' | 'MODULE_REVIEW'
  createdAt: Date | string
  authorName: string
  authorRole?: UserRole
  moduleTitle: string | null
  studentName?: string | null
  groupLabel?: string | null
  canDelete: boolean
}

interface Props {
  comments: CommentListItem[]
  onDelete: (commentId: string) => Promise<AdminActionResult>
  emptyText?: string
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toLocaleDateString('hr-HR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function roleLabel(role: UserRole | undefined): string | null {
  if (!role) return null
  if (role === 'ADMIN') return 'Admin'
  if (role === 'TEACHER') return 'Nastavnik'
  return null
}

export function CommentList({
  comments,
  onDelete,
  emptyText = 'Nema bilješki.',
}: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (comments.length === 0) {
    return <p className="text-sm text-gray-400 italic">{emptyText}</p>
  }

  const handleDelete = (id: string) => {
    if (!globalThis.confirm('Izbrisati bilješku?')) return
    startTransition(async () => {
      const result = await onDelete(id)
      if (result.success) {
        toast.success('Bilješka izbrisana.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri brisanju.')
      }
    })
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => {
        const role = roleLabel(c.authorRole)
        const isReview = c.type === 'MODULE_REVIEW'
        return (
          <article
            key={c.id}
            className={[
              'p-4 bg-gray-50 rounded-lg border-l-4',
              isReview ? 'border-purple-300' : 'border-cyan-300',
            ].join(' ')}
          >
            <header className="mb-2">
              {c.studentName ? (
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {c.studentName}
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium text-gray-800">
                    {c.authorName}
                  </span>
                  {role ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {role}
                    </Badge>
                  ) : null}
                  <Badge
                    variant="secondary"
                    className={
                      isReview
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                    }
                  >
                    {(() => {
                      if (!isReview) return 'Komentar'
                      return c.moduleTitle ? `Ocjena modula: ${c.moduleTitle}` : 'Ocjena modula'
                    })()}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">
                    {formatDate(c.createdAt)}
                  </span>
                  {c.canDelete ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={isPending}
                      className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      aria-label="Izbriši bilješku"
                      title="Izbriši bilješku"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </header>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {c.content}
            </p>
            {c.groupLabel ? (
              <p className="text-xs text-gray-400 mt-2">
                Grupa: {c.groupLabel}
              </p>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
