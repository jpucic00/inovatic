'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleEnrollment } from '@/actions/admin/student'
import { toast } from 'sonner'

interface EnrollmentToggleProps {
  enrollmentId: string
  currentStatus: string
}

export function EnrollmentToggle({
  enrollmentId,
  currentStatus,
}: Readonly<EnrollmentToggleProps>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isActive = currentStatus === 'ACTIVE'

  const handleToggle = () => {
    startTransition(async () => {
      const result = await toggleEnrollment(enrollmentId)
      if (result.success) {
        toast.success(isActive ? 'Upis deaktiviran.' : 'Upis reaktiviran.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri promjeni.')
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={[
        'px-3 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-50',
        isActive
          ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'
          : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100',
      ].join(' ')}
    >
      {isPending ? '...' : isActive ? 'Deaktiviraj' : 'Aktiviraj'}
    </button>
  )
}
