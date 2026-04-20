'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { UserPlus, Copy, ExternalLink } from 'lucide-react'
import { createStudentManually } from '@/actions/admin/student'
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
  const [result, setResult] = useState<{
    username: string
    password: string
    isExisting: boolean
    studentId: string
  } | null>(null)

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null
  const courseModules = selectedGroup?.course.modules ?? []
  const isStandardCourse = selectedGroup ? !selectedGroup.course.isCustom : false
  const allScheduleIds = courseModules
    .map(getScheduleId)
    .filter((id): id is string => id !== null)

  const canSubmit = firstName.trim().length >= 2 && lastName.trim().length >= 2

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
    setResult(null)
  }

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourseId(courseId)
    setSelectedGroupId('')
    setSelectedScheduleIds([])
    setGroups([])
    if (!courseId) return
    setLoadingGroups(true)
    try {
      const res = await getGroupsForCourseInYears(courseId)
      setGroups(
        res.map((g) => ({
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
    if (!canSubmit) {
      toast.error('Ime i prezime djeteta su obavezni.')
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
        dateOfBirth: dateOfBirth || null,
        parentName: parentName.trim() || null,
        parentEmail: parentEmail.trim() || null,
        parentPhone: parentPhone.trim() || null,
        childSchool: childSchool.trim() || null,
        groupId: selectedGroupId || null,
        moduleScheduleIds:
          selectedGroupId && isStandardCourse && selectedScheduleIds.length > 0
            ? selectedScheduleIds
            : undefined,
      })
      if (res.success) {
        setResult(res)
        toast.success(
          res.isExisting
            ? 'Postojeći učenik pronađen i ažuriran.'
            : 'Račun učenika kreiran.',
        )
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri kreiranju.')
      }
    })
  }

  const copyCredentials = () => {
    if (!result) return
    const text = `Korisničko ime: ${result.username}\nLozinka: ${result.password}`
    navigator.clipboard.writeText(text)
    toast.success('Podaci kopirani.')
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
          <DialogTitle>
            {result ? 'Učenik kreiran' : 'Kreiraj učenika'}
          </DialogTitle>
          <DialogDescription>
            {result
              ? result.isExisting
                ? 'Pronađen je postojeći račun za ovo dijete.'
                : 'Novi račun je uspješno kreiran.'
              : 'Unesite podatke djeteta. Upis u grupu i roditeljski podaci su neobavezni.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            {!result.isExisting && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm font-medium text-green-800 mb-2">
                  Pristupni podaci
                </p>
                <div className="font-mono text-sm text-gray-800 space-y-1">
                  <p>
                    <span className="text-gray-500">Korisničko ime:</span>{' '}
                    {result.username}
                  </p>
                  <p>
                    <span className="text-gray-500">Lozinka:</span>{' '}
                    {result.password}
                  </p>
                </div>
                <button
                  onClick={copyCredentials}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Kopiraj podatke
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Link
                href={`/admin/ucenici/${result.studentId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Profil učenika
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Zatvori
              </button>
            </div>
          </div>
        ) : (
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
                    Datum rođenja
                  </label>
                  <input
                    id="create-student-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
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
                Roditelj (neobavezno)
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
                    E-mail
                  </label>
                  <input
                    id="create-student-parent-email"
                    type="email"
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
                  {loadingGroups ? (
                    <p className="text-sm text-gray-400 italic py-3 text-center">
                      Učitavam grupe...
                    </p>
                  ) : groups.length === 0 ? (
                    <p className="text-sm text-gray-400 italic py-3 text-center">
                      Nema dostupnih grupa za ovaj program.
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
                            'flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors',
                            selectedGroupId === g.id
                              ? 'bg-cyan-50 border-cyan-300'
                              : 'bg-white border-gray-200 hover:border-gray-300',
                          ].join(' ')}
                        >
                          <input
                            type="radio"
                            name="create-student-group"
                            value={g.id}
                            checked={selectedGroupId === g.id}
                            onChange={() => handleGroupSelect(g.id)}
                            className="h-4 w-4 border-gray-300 text-cyan-600 focus:ring-cyan-500"
                          />
                          <span className="flex-1 text-sm text-gray-800">
                            {label}
                          </span>
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
                              {formatDateRange(startDate, endDate)}
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
                disabled={isPending || !canSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Kreiram...' : 'Kreiraj učenika'}
              </button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
