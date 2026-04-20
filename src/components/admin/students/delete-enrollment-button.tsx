'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteEnrollment } from '@/actions/admin/student'
import { toast } from 'sonner'

interface DeleteEnrollmentButtonProps {
  enrollmentId: string
}

export function DeleteEnrollmentButton({
  enrollmentId,
}: Readonly<DeleteEnrollmentButtonProps>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    if (!window.confirm('Izbrisati upis? Svi moduli ovog upisa bit će uklonjeni.')) {
      return
    }
    startTransition(async () => {
      const result = await deleteEnrollment(enrollmentId)
      if (result.success) {
        toast.success('Upis izbrisan.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri brisanju.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
      title="Ukloni upis"
    >
      <Trash2 className="w-3 h-3" />
      {isPending ? '...' : 'Ukloni upis'}
    </button>
  )
}
