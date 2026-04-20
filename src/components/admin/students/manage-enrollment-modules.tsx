'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { addModuleEnrollment } from '@/actions/admin/module-enrollment'
import { removeModuleEnrollment } from '@/actions/admin/student'

type EnrolledModule = {
  id: string
  moduleTitle: string
}

type AvailableModule = {
  moduleScheduleId: string
  moduleTitle: string
}

interface Props {
  studentId: string
  enrollmentId: string
  enrolled: EnrolledModule[]
  available: AvailableModule[]
}

export function ManageEnrollmentModules({
  studentId,
  enrollmentId,
  enrolled,
  available,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleAdd = (moduleScheduleId: string) => {
    setPendingId(moduleScheduleId)
    startTransition(async () => {
      const res = await addModuleEnrollment(enrollmentId, moduleScheduleId)
      setPendingId(null)
      if (res.success) {
        toast.success('Modul dodan.')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri dodavanju modula.')
      }
    })
  }

  const handleRemove = (moduleEnrollmentId: string) => {
    setPendingId(moduleEnrollmentId)
    startTransition(async () => {
      const res = await removeModuleEnrollment(moduleEnrollmentId, studentId)
      setPendingId(null)
      if (res.success) {
        toast.success('Modul uklonjen.')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri uklanjanju modula.')
      }
    })
  }

  if (enrolled.length === 0 && available.length === 0) {
    return null
  }

  return (
    <div className="mt-3 space-y-2">
      {enrolled.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {enrolled.map((m) => {
            const isBusy = isPending && pendingId === m.id
            return (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-white border text-gray-700"
              >
                {m.moduleTitle}
                <button
                  type="button"
                  onClick={() => handleRemove(m.id)}
                  disabled={isBusy}
                  className="ml-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                  title="Ukloni iz modula"
                >
                  {isBusy ? (
                    <span className="text-[10px]">...</span>
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                </button>
              </span>
            )
          })}
        </div>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {available.map((m) => {
            const isBusy = isPending && pendingId === m.moduleScheduleId
            return (
              <button
                key={m.moduleScheduleId}
                type="button"
                onClick={() => handleAdd(m.moduleScheduleId)}
                disabled={isBusy}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-cyan-400 hover:text-cyan-700 disabled:opacity-50"
              >
                {isBusy ? (
                  <span className="text-[10px]">...</span>
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                {m.moduleTitle}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
