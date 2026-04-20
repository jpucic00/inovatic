'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import {
  assignTeacherToGroup,
  unassignTeacherFromGroup,
} from '@/actions/admin/teacher'
import { toast } from 'sonner'

type Assignment = {
  id: string
  scheduledGroup: {
    id: string
    name: string | null
    dayOfWeek: string | null
    startTime: string | null
    endTime: string | null
    schoolYear: string
    course: { id: string; title: string; slug: string }
    location: { name: string }
  }
}

type AssignableGroup = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  course: { title: string }
  location: { name: string }
}

interface Props {
  teacherId: string
  assignments: Assignment[]
  assignableGroups: AssignableGroup[]
}

function formatSchedule(g: {
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
}) {
  const timeRange = g.startTime ? `${g.startTime}–${g.endTime ?? ''}` : null
  return [g.dayOfWeek, timeRange].filter(Boolean).join(', ')
}

export function TeacherAssignmentPanel({
  teacherId,
  assignments,
  assignableGroups,
}: Readonly<Props>) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleAssign = () => {
    if (!selectedGroupId) return
    startTransition(async () => {
      const res = await assignTeacherToGroup({
        teacherId,
        scheduledGroupId: selectedGroupId,
      })
      if (res.success) {
        toast.success('Grupa dodijeljena.')
        setAdding(false)
        setSelectedGroupId('')
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
        toast.success('Dodjela uklonjena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Dodijeljene grupe</h2>
        {!adding && assignableGroups.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Dodijeli grupu
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <label
            htmlFor="assign-group-select"
            className="block text-xs font-medium text-gray-600 mb-2"
          >
            Odaberite grupu
          </label>
          <select
            id="assign-group-select"
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">– Odaberite grupu –</option>
            {assignableGroups.map((g) => {
              const label = [
                g.course.title,
                g.name,
                formatSchedule(g),
                g.location.name,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <option key={g.id} value={g.id}>
                  {label} ({g.schoolYear})
                </option>
              )
            })}
          </select>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setAdding(false)
                setSelectedGroupId('')
              }}
              disabled={isPending}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              onClick={handleAssign}
              disabled={isPending || !selectedGroupId}
              className="px-3 py-1.5 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Dodjeljujem...' : 'Dodijeli'}
            </button>
          </div>
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Još nema dodijeljenih grupa.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {a.scheduledGroup.course.title}
                  {a.scheduledGroup.name && (
                    <span className="text-gray-500"> — {a.scheduledGroup.name}</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[formatSchedule(a.scheduledGroup), a.scheduledGroup.location.name]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-medium text-gray-500 bg-gray-200/60 rounded px-1.5 py-0.5">
                  {a.scheduledGroup.schoolYear}
                </span>
                <button
                  onClick={() => handleUnassign(a.id)}
                  disabled={isPending}
                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  aria-label="Ukloni dodjelu"
                  title="Ukloni dodjelu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
