'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import type { AdminActionResult } from '@/lib/action-types'
import type { UserRole } from '@prisma/client'
import { formatDate } from '@/lib/format'

export type CommentListItem = {
  id: string
  content: string
  createdAt: Date | string
  authorName: string
  authorRole?: UserRole
  authorDeleted?: boolean
  canDelete: boolean
}

interface Props {
  comments: CommentListItem[]
  onDelete: (commentId: string) => Promise<AdminActionResult>
  emptyText?: string
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
        return (
          <article
            key={c.id}
            className="p-4 bg-gray-50 rounded-lg border-l-4 border-cyan-300"
          >
            <header className="mb-2 flex items-start justify-between gap-3">
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
                {c.authorDeleted ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 border border-gray-200"
                  >
                    Bivši nastavnik
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">
                  {formatDate(new Date(c.createdAt))}
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
            </header>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {c.content}
            </p>
          </article>
        )
      })}
    </div>
  )
}
