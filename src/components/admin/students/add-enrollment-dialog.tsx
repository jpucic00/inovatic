'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { BookPlus } from 'lucide-react'
import { addEnrollment } from '@/actions/admin/student'
import { getGroupsForCourseInYears } from '@/actions/admin/inquiry'
import { toast } from 'sonner'

type ModuleOption = {
  id: string
  title: string
  sortOrder: number
  schedules?: { id: string; schoolYear?: string; startDate: Date | null; endDate: Date | null }[]
}

type GroupOption = {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  location: { name: string }
  course: { title: string; isCustom?: boolean; modules?: ModuleOption[] }
}

type CourseOption = {
  id: string
  title: string
}

interface Props {
  studentId: string
  courses: CourseOption[]
}

function getScheduleId(mod: ModuleOption): string | null {
  return mod.schedules?.[0]?.id ?? null
}

function getScheduleDates(mod: ModuleOption): { startDate: Date | null; endDate: Date | null } {
  const s = mod.schedules?.[0]
  return { startDate: s?.startDate ?? null, endDate: s?.endDate ?? null }
}

function formatDateRange(startDate: Date | null, endDate: Date | null): string {
  if (!startDate || !endDate) return ''
  const s = new Date(startDate)
  const e = new Date(endDate)
  const sd = `${String(s.getDate()).padStart(2, '0')}.${String(s.getMonth() + 1).padStart(2, '0')}.`
  const ed = `${String(e.getDate()).padStart(2, '0')}.${String(e.getMonth() + 1).padStart(2, '0')}.${e.getFullYear()}.`
  return ` (${sd} – ${ed})`
}

export function AddEnrollmentDialog({ studentId, courses }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [isPending, startTransition] = useTransition()

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null
  const courseModules = selectedGroup?.course.modules ?? []
  const isStandardCourse = selectedGroup ? !selectedGroup.course.isCustom : false
  const allScheduleIds = courseModules
    .map(getScheduleId)
    .filter((id): id is string => id !== null)

  const reset = () => {
    setSelectedCourseId('')
    setSelectedGroupId('')
    setSelectedScheduleIds([])
    setGroups([])
  }

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourseId(courseId)
    setSelectedGroupId('')
    setSelectedScheduleIds([])
    setGroups([])
    if (!courseId) return
    setLoadingGroups(true)
    try {
      const result = await getGroupsForCourseInYears(courseId)
      setGroups(
        result.map((g) => ({
          id: g.id,
          name: g.name,
          dayOfWeek: g.dayOfWeek,
          startTime: g.startTime,
          endTime: g.endTime,
          schoolYear: g.schoolYear,
          location: { name: g.location.name },
          course: {
            title: g.course.title,
            isCustom: g.course.isCustom,
            modules: g.course.modules,
          },
        })),
      )
    } finally {
      setLoadingGroups(false)
    }
  }

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId)
    setSelectedScheduleIds([])
  }

  const toggleScheduleId = (scheduleId: string) => {
    setSelectedScheduleIds((prev) =>
      prev.includes(scheduleId)
        ? prev.filter((id) => id !== scheduleId)
        : [...prev, scheduleId],
    )
  }

  const handleSubmit = () => {
    if (!selectedGroupId) {
      toast.error('Odaberite grupu.')
      return
    }
    startTransition(async () => {
      const res = await addEnrollment({
        studentId,
        groupId: selectedGroupId,
        moduleScheduleIds:
          isStandardCourse && selectedScheduleIds.length > 0
            ? selectedScheduleIds
            : undefined,
      })
      if (res.success) {
        toast.success('Učenik upisan u grupu.')
        reset()
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri upisu.')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors">
          <BookPlus className="w-3.5 h-3.5" />
          Upiši u novu grupu
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upiši u novu grupu</DialogTitle>
          <DialogDescription>
            Odaberite program, grupu i module za novi upis.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label
            htmlFor="add-enrollment-course"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            Program
          </label>
          <select
            id="add-enrollment-course"
            value={selectedCourseId}
            onChange={(e) => handleCourseChange(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          >
            <option value="">– Odaberite program –</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto py-2">
          {loadingGroups ? (
            <p className="text-sm text-gray-400 italic py-4 text-center">
              Učitavam grupe...
            </p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-4 text-center">
              {!selectedCourseId
                ? 'Najprije odaberite program.'
                : 'Nema dostupnih grupa za ovaj program.'}
            </p>
          ) : (
            groups.map((g) => {
              const timeRange = g.startTime
                ? `${g.startTime}–${g.endTime ?? ''}`
                : null
              const label = [g.name, g.dayOfWeek, timeRange, g.location.name]
                .filter(Boolean)
                .join(' · ')
              return (
                <label
                  key={g.id}
                  className={[
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedGroupId === g.id
                      ? 'bg-cyan-50 border-cyan-300'
                      : 'bg-white border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="add-enrollment-group"
                    value={g.id}
                    checked={selectedGroupId === g.id}
                    onChange={() => handleGroupSelect(g.id)}
                    className="h-4 w-4 border-gray-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="flex-1 text-sm text-gray-800">{label}</span>
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                    {g.schoolYear}
                  </span>
                </label>
              )
            })
          )}
        </div>

        {isStandardCourse && courseModules.length > 0 && (
          <div className="py-2">
            <div className="block text-sm font-medium text-gray-700 mb-1.5">
              Moduli
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 cursor-pointer border-b border-gray-100 pb-2 mb-1">
                <input
                  type="checkbox"
                  checked={
                    allScheduleIds.length > 0 &&
                    selectedScheduleIds.length === allScheduleIds.length
                  }
                  onChange={() => {
                    if (selectedScheduleIds.length === allScheduleIds.length) {
                      setSelectedScheduleIds([])
                    } else {
                      setSelectedScheduleIds(allScheduleIds)
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-gray-800">Svi moduli</span>
              </label>
              {courseModules.map((mod) => {
                const scheduleId = getScheduleId(mod)
                if (!scheduleId) return null
                const { startDate, endDate } = getScheduleDates(mod)
                return (
                  <label
                    key={mod.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedScheduleIds.includes(scheduleId)}
                      onChange={() => toggleScheduleId(scheduleId)}
                      className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-gray-800">
                      {mod.title}
                      <span className="text-gray-400 text-xs ml-1">
                        {formatDateRange(startDate, endDate)}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !selectedGroupId}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Upisujem...' : 'Upiši'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
