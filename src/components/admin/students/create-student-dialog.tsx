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
import { DateInput } from '@/components/ui/date-input'
import { createStudentManually } from '@/actions/admin/student'
import { getGroupsForCourseInSelectedYear } from '@/actions/admin/inquiry'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'
import { toast } from 'sonner'
import { formatModuleDateRange } from '@/lib/format'

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
  availableSpots: number
  isFull: boolean
  location: { name: string }
  course: { title: string; isCustom?: boolean; modules?: ModuleOption[] }
}

type CourseOption = {
  id: string
  title: string
}

interface Props {
  courses: CourseOption[]
}

function getScheduleId(mod: ModuleOption): string | null {
  return mod.schedules?.[0]?.id ?? null
}

function getScheduleDates(mod: ModuleOption): { startDate: Date | null; endDate: Date | null } {
  const s = mod.schedules?.[0]
  return { startDate: s?.startDate ?? null, endDate: s?.endDate ?? null }
}


export function CreateStudentDialog({ courses }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Child + parent
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [childSchool, setChildSchool] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')

  // Enrollment
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

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    dateOfBirth.trim().length > 0 &&
    parentEmail.trim().length > 0

  const reset = () => {
    setFirstName('')
    setLastName('')
    setDateOfBirth('')
    setChildSchool('')
    setParentName('')
    setParentEmail('')
    setParentPhone('')
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
      const res = await getGroupsForCourseInSelectedYear(courseId)
      setGroups(
        res.map((g) => ({
          id: g.id,
          name: g.name,
          dayOfWeek: g.dayOfWeek,
          startTime: g.startTime,
          endTime: g.endTime,
          schoolYear: g.schoolYear,
          availableSpots: g.availableSpots,
          isFull: g.isFull,
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
    const target = groups.find((g) => g.id === groupId)
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

  const handleSubmit = () => {
    if (!canSubmit) {
      toast.error('Ime, prezime i datum rođenja djeteta te e-mail roditelja su obavezni.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(parentEmail.trim())) {
      toast.error('Unesite valjanu email adresu roditelja.')
      return
    }
    // Require at least one module for standard courses when a group is chosen
    if (selectedGroupId && isStandardCourse && selectedScheduleIds.length === 0) {
      toast.error('Odaberite barem jedan modul za ovaj program.')
      return
    }
    startTransition(async () => {
      const res = await createStudentManually({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth.trim(),
        parentName: parentName.trim() || null,
        parentEmail: parentEmail.trim(),
        parentPhone: parentPhone.trim() || null,
        childSchool: childSchool.trim() || null,
        groupId: selectedGroupId || null,
        moduleScheduleIds:
          selectedGroupId && isStandardCourse && selectedScheduleIds.length > 0
            ? selectedScheduleIds
            : undefined,
      })
      if (res.success) {
        if (res.emailFailed) {
          toast.warning(
            'Račun kreiran, ali slanje e-maila nije uspjelo — pristupni podaci su dostupni na profilu učenika.',
          )
        } else {
          toast.success(
            res.isExisting
              ? 'Postojeći učenik pronađen i ažuriran.'
              : 'Račun učenika kreiran. Otvorite profil učenika za pristupne podatke.',
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <UserPlus className="w-4 h-4" />
          Kreiraj učenika
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kreiraj učenika</DialogTitle>
          <DialogDescription>
            Unesite podatke djeteta. Upis u grupu i roditeljski podaci su neobavezni.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
            {/* Child fields */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Dijete
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="create-student-first"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Ime *
                  </label>
                  <input
                    id="create-student-first"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-student-last"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Prezime *
                  </label>
                  <input
                    id="create-student-last"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-student-dob"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Datum rođenja *
                  </label>
                  <DateInput
                    id="create-student-dob"
                    value={dateOfBirth}
                    onChange={setDateOfBirth}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-student-school"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Škola
                  </label>
                  <input
                    id="create-student-school"
                    type="text"
                    value={childSchool}
                    onChange={(e) => setChildSchool(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Parent fields */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Roditelj
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label
                    htmlFor="create-student-parent-name"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Ime i prezime
                  </label>
                  <input
                    id="create-student-parent-name"
                    type="text"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-student-parent-email"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    E-mail *
                  </label>
                  <input
                    id="create-student-parent-email"
                    type="email"
                    required
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-student-parent-phone"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Telefon
                  </label>
                  <input
                    id="create-student-parent-phone"
                    type="tel"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                E-mail s pristupnim podacima šalje se samo ako unesete roditeljski
                e-mail i odmah upišete dijete u grupu.
              </p>
            </div>

            {/* Enrollment fields */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Odmah upiši u grupu (neobavezno)
              </h3>

              <div>
                <label
                  htmlFor="create-student-course"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Program
                </label>
                <select
                  id="create-student-course"
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="">– Odaberite program –</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCourseId && (
                <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                  {loadingGroups && (
                    <p className="text-sm text-gray-400 italic py-3 text-center">
                      Učitavam grupe...
                    </p>
                  )}
                  {!loadingGroups && groups.length === 0 && (
                    <p className="text-sm text-gray-400 italic py-3 text-center">
                      Nema dostupnih grupa za ovaj program.
                    </p>
                  )}
                  {!loadingGroups && groups.length > 0 && (
                    groups.map((g) => {
                      const timeRange = g.startTime
                        ? `${g.startTime}–${g.endTime ?? ''}`
                        : null
                      const label = [g.name, g.dayOfWeek, timeRange, g.location.name]
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
                          className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${wrapperClass}`}
                        >
                          <input
                            type="radio"
                            name="create-student-group"
                            value={g.id}
                            checked={selectedGroupId === g.id}
                            onChange={() => handleGroupSelect(g.id)}
                            disabled={g.isFull}
                            className="h-4 w-4 border-gray-300 text-cyan-600 focus:ring-cyan-500 disabled:cursor-not-allowed"
                          />
                          <span className="flex-1 text-sm text-gray-800">
                            {label}
                          </span>
                          <GroupCapacityChip availableSpots={g.availableSpots} isFull={g.isFull} />
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                            {g.schoolYear}
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              )}

              {isStandardCourse && courseModules.length > 0 && (
                <div className="mt-3">
                  <div className="block text-xs font-medium text-gray-600 mb-1">
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
                      <span className="text-sm font-medium text-gray-800">
                        Svi moduli
                      </span>
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
                              {startDate && endDate ? formatModuleDateRange(startDate, endDate) : ''}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

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
                disabled={isPending || !canSubmit || (selectedGroup?.isFull ?? false)}
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Kreiram...' : 'Kreiraj učenika'}
              </button>
            </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
