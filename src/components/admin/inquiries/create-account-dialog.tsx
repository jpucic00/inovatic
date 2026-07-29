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
import { UserPlus } from 'lucide-react'
import { createStudentFromInquiry } from '@/actions/admin/student'
import { getGroupsForCourse } from '@/actions/admin/inquiry'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'
import { formatGroupSchedule, formatModuleDateRange as fmtModuleDateRange } from '@/lib/format'
import { toast } from 'sonner'
import { isRadionica } from '@/lib/program-kind'
import { hasDatedModules } from '@/lib/program-kind'
import type { ProgramKind } from '@prisma/client'

type ModuleOption = {
  id: string
  title: string
  sortOrder: number
  schedules?: { id: string; startDate: Date | null; endDate: Date | null }[]
}

interface GroupOption {
  id: string
  name: string | null
  dayOfWeek: string | null
  dateStart: string | null
  dateEnd: string | null
  startTime: string | null
  endTime: string | null
  availableSpots: number
  isFull: boolean
  location: { name: string }
  course: { title: string; kind: ProgramKind; modules?: ModuleOption[] }
}

interface CourseOption {
  id: string
  title: string
}

interface CreateAccountDialogProps {
  inquiryId: string
  childName: string
  initialGroups: GroupOption[]
  courses: CourseOption[]
  preferredCourseId?: string
  preferredGroupId?: string
}

function getScheduleId(mod: ModuleOption): string | null {
  return mod.schedules?.[0]?.id ?? null
}

function getScheduleDates(mod: ModuleOption): { startDate: Date | null; endDate: Date | null } {
  const schedule = mod.schedules?.[0]
  return { startDate: schedule?.startDate ?? null, endDate: schedule?.endDate ?? null }
}

function mapGroupOption(sg: {
  id: string
  name: string | null
  dayOfWeek: string | null
  dateStart: string | null
  dateEnd: string | null
  startTime: string | null
  endTime: string | null
  availableSpots?: number
  isFull?: boolean
  location: { name: string }
  course: { title: string; kind: ProgramKind; modules?: ModuleOption[] }
}): GroupOption {
  return {
    id: sg.id,
    name: sg.name,
    dayOfWeek: sg.dayOfWeek,
    dateStart: sg.dateStart,
    dateEnd: sg.dateEnd,
    startTime: sg.startTime,
    endTime: sg.endTime,
    availableSpots: sg.availableSpots ?? 0,
    isFull: sg.isFull ?? false,
    location: { name: sg.location.name },
    course: {
      title: sg.course.title,
      kind: sg.course.kind,
      modules: sg.course.modules,
    },
  }
}

function formatModuleDateRange(mod: ModuleOption): string {
  const { startDate, endDate } = getScheduleDates(mod)
  if (!startDate || !endDate) return ''
  return fmtModuleDateRange(new Date(startDate), new Date(endDate))
}

export function CreateAccountDialog({
  inquiryId,
  childName,
  initialGroups,
  courses,
  preferredCourseId,
  preferredGroupId,
}: Readonly<CreateAccountDialogProps>) {
  const [open, setOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState(preferredGroupId ?? '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [selectedCourseId, setSelectedCourseId] = useState(preferredCourseId ?? '')
  const [loadedGroups, setLoadedGroups] = useState<GroupOption[]>(initialGroups)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([])

  const selectedGroup = loadedGroups.find((g) => g.id === selectedGroupId)
  const courseModules = selectedGroup?.course.modules ?? []
  const isStandardCourse = selectedGroup ? hasDatedModules(selectedGroup.course.kind) : false

  // Get schedule IDs for all modules
  const allScheduleIds = courseModules
    .map(getScheduleId)
    .filter((id): id is string => id !== null)

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourseId(courseId)
    setSelectedGroupId('')
    setSelectedScheduleIds([])
    setLoadedGroups([])
    if (!courseId) return
    setLoadingGroups(true)
    try {
      const groups = await getGroupsForCourse(courseId)
      setLoadedGroups(groups.map(mapGroupOption))
    } finally {
      setLoadingGroups(false)
    }
  }

  const handleGroupSelect = (groupId: string) => {
    const target = loadedGroups.find((g) => g.id === groupId)
    if (target?.isFull) return
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

  const handleCreate = () => {
    if (!selectedGroupId) {
      toast.error('Odaberite grupu za upis.')
      return
    }
    if (isStandardCourse && selectedScheduleIds.length === 0) {
      toast.error('Odaberite barem jedan modul.')
      return
    }
    startTransition(async () => {
      const res = await createStudentFromInquiry(
        inquiryId,
        selectedGroupId,
        isStandardCourse && selectedScheduleIds.length > 0 ? selectedScheduleIds : undefined,
      )
      if (res.success) {
        if (res.emailFailed) {
          toast.warning(
            'Račun kreiran, ali slanje e-maila nije uspjelo — pristupni podaci su dostupni na profilu učenika.',
          )
        } else {
          toast.success(
            res.isExisting
              ? 'Dijete upisano u novu grupu (postojeći račun).'
              : 'Račun kreiran i dijete upisano. Otvorite profil učenika za pristupne podatke.',
          )
        }
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri kreiranju.')
        if (res.code === 'GROUP_FULL') {
          if (selectedCourseId) await handleCourseChange(selectedCourseId)
          setSelectedGroupId('')
          router.refresh()
        }
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <UserPlus className="w-4 h-4" />
          Kreiraj račun i upiši
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kreiraj račun i upiši dijete</DialogTitle>
          <DialogDescription>
            Odaberite grupu u koju želite upisati {childName}.
          </DialogDescription>
        </DialogHeader>

        <>
          <div className="py-2">
              <label htmlFor="course-select" className="block text-sm font-medium text-gray-700 mb-1.5">
                Program
              </label>
              <select
                id="course-select"
                value={selectedCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="">– Odaberite program –</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto py-2">
              {loadingGroups && (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  Učitavam grupe...
                </p>
              )}
              {!loadingGroups && loadedGroups.length === 0 && (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  {selectedCourseId
                    ? 'Nema dostupnih grupa za ovaj program.'
                    : 'Najprije odaberite program.'}
                </p>
              )}
              {!loadingGroups && loadedGroups.length > 0 && (
                loadedGroups.map((g) => {
                  const schedule = formatGroupSchedule({
                    dateRange: isRadionica(g.course.kind),
                    dayOfWeek: g.dayOfWeek,
                    dateStart: g.dateStart,
                    dateEnd: g.dateEnd,
                    startTime: g.startTime,
                    endTime: g.endTime,
                  })
                  const label = [g.name, schedule || null, g.location.name]
                    .filter(Boolean)
                    .join(' · ')
                  const wrapperClass = (() => {
                    if (g.isFull) return 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    if (selectedGroupId === g.id) return 'bg-cyan-50 border-cyan-300 cursor-pointer'
                    return 'bg-white border-gray-200 hover:border-gray-300 cursor-pointer'
                  })()
                  return (
                    <label
                      key={g.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${wrapperClass}`}
                    >
                      <input
                        type="radio"
                        name="group"
                        value={g.id}
                        checked={selectedGroupId === g.id}
                        onChange={() => handleGroupSelect(g.id)}
                        disabled={g.isFull}
                        className="h-4 w-4 border-gray-300 text-cyan-600 focus:ring-cyan-500 disabled:cursor-not-allowed"
                      />
                      <span className="flex-1 text-sm text-gray-800">{label}</span>
                      <GroupCapacityChip availableSpots={g.availableSpots} isFull={g.isFull} />
                    </label>
                  )
                })
              )}
            </div>

            {isStandardCourse && courseModules.length > 0 && (
              <div className="py-2">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">
                  Moduli
                </span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 cursor-pointer border-b border-gray-100 pb-2 mb-1">
                    <input
                      type="checkbox"
                      checked={allScheduleIds.length > 0 && selectedScheduleIds.length === allScheduleIds.length}
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
                    const dateRange = formatModuleDateRange(mod)
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
                          <span className="text-gray-400 text-xs ml-1">{dateRange}</span>
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
                onClick={handleCreate}
                disabled={
                  isPending ||
                  !selectedGroupId ||
                  (selectedGroup?.isFull ?? false) ||
                  (isStandardCourse && selectedScheduleIds.length === 0)
                }
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Kreiram...' : 'Kreiraj račun i upiši'}
              </button>
            </DialogFooter>
        </>
      </DialogContent>
    </Dialog>
  )
}
