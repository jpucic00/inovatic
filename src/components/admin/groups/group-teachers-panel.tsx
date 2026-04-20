'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, Users } from 'lucide-react'
import {
  assignTeacherToGroup,
  unassignTeacherFromGroup,
} from '@/actions/admin/teacher'
import { toast } from 'sonner'

type Assignment = {
  id: string
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
}

type AssignableTeacher = {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface Props {
  groupId: string
  assignments: Assignment[]
  assignableTeachers: AssignableTeacher[]
}

export function GroupTeachersPanel({
  groupId,
  assignments,
  assignableTeachers,
}: Readonly<Props>) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleAssign = () => {
    if (!selectedTeacherId) return
    startTransition(async () => {
      const res = await assignTeacherToGroup({
        teacherId: selectedTeacherId,
        scheduledGroupId: groupId,
      })
      if (res.success) {
        toast.success('Nastavnik dodijeljen.')
        setAdding(false)
        setSelectedTeacherId('')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleUnassign = (assignmentId: string) => {
    startTransition(async () => {
      const res = await unassignTeacherFromGroup(assignmentId)
      if (res.success) {
        toast.success('Nastavnik uklonjen.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Nastavnici</h2>
        {!adding && assignableTeachers.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Dodaj nastavnika
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <label
            htmlFor="assign-teacher-select"
            className="block text-xs font-medium text-gray-600 mb-2"
          >
            Odaberite nastavnika
          </label>
          <select
            id="assign-teacher-select"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">– Odaberite nastavnika –</option>
            {assignableTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName} ({t.email})
              </option>
            ))}
          </select>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setAdding(false)
                setSelectedTeacherId('')
              }}
              disabled={isPending}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              onClick={handleAssign}
              disabled={isPending || !selectedTeacherId}
              className="px-3 py-1.5 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Dodjeljujem...' : 'Dodijeli'}
            </button>
          </div>
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nema dodijeljenih nastavnika.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <Link
                    href={`/admin/nastavnici/${a.user.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-cyan-700 transition-colors"
                  >
                    {a.user.firstName} {a.user.lastName}
                  </Link>
                  <p className="text-xs text-gray-500 truncate">{a.user.email}</p>
                </div>
              </div>
              <button
                onClick={() => handleUnassign(a.id)}
                disabled={isPending}
                className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
                aria-label="Ukloni nastavnika"
                title="Ukloni nastavnika"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
