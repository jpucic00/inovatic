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
import { UserPlus, Copy, ExternalLink } from 'lucide-react'
import { createStudentFromInquiry } from '@/actions/admin/student'
import { getGroupsForCourse } from '@/actions/admin/inquiry'
import { toast } from 'sonner'
import Link from 'next/link'

type ModuleOption = {
  id: string
  title: string
  sortOrder: number
  startDate: Date | null
  endDate: Date | null
}

interface GroupOption {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  location: { name: string }
  course: { title: string; isCustom?: boolean; modules?: ModuleOption[] }
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
  const [result, setResult] = useState<{
    username: string
    password: string
    isExisting: boolean
    studentId: string
  } | null>(null)
  const router = useRouter()
  const [selectedCourseId, setSelectedCourseId] = useState(preferredCourseId ?? '')
  const [loadedGroups, setLoadedGroups] = useState<GroupOption[]>(initialGroups)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([])

  const selectedGroup = loadedGroups.find((g) => g.id === selectedGroupId)
  const courseModules = selectedGroup?.course.modules ?? []
  const isStandardCourse = selectedGroup ? !selectedGroup.course.isCustom : false

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourseId(courseId)
    setSelectedGroupId('')
    setSelectedModuleIds([])
    setLoadedGroups([])
    if (!courseId) return
    setLoadingGroups(true)
    try {
      const groups = await getGroupsForCourse(courseId)
      setLoadedGroups(
        groups.map((sg) => ({
          id: sg.id,
          name: sg.name,
          dayOfWeek: sg.dayOfWeek,
          startTime: sg.startTime,
          endTime: sg.endTime,
          location: { name: sg.location.name },
          course: {
            title: sg.course.title,
            isCustom: sg.course.isCustom,
            modules: sg.course.modules,
          },
        })),
      )
    } finally {
      setLoadingGroups(false)
    }
  }

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId)
    setSelectedModuleIds([])
  }

  const toggleModuleId = (moduleId: string) => {
    setSelectedModuleIds((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId],
    )
  }

  const handleCreate = () => {
    if (!selectedGroupId) {
      toast.error('Odaberite grupu za upis.')
      return
    }
    if (isStandardCourse && selectedModuleIds.length === 0) {
      toast.error('Odaberite barem jedan modul.')
      return
    }
    startTransition(async () => {
      const res = await createStudentFromInquiry(
        inquiryId,
        selectedGroupId,
        isStandardCourse && selectedModuleIds.length > 0 ? selectedModuleIds : undefined,
      )
      if (res.success) {
        setResult(res)
        toast.success(
          res.isExisting
            ? 'Dijete upisano u novu grupu (postojeći račun).'
            : 'Račun kreiran i dijete upisano!',
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <UserPlus className="w-4 h-4" />
          Kreiraj račun i upiši
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {result ? 'Račun kreiran' : 'Kreiraj račun i upiši dijete'}
          </DialogTitle>
          <DialogDescription>
            {result
              ? result.isExisting
                ? `${childName} je upisano u novu grupu s postojećim računom.`
                : `Račun za ${childName} je uspješno kreiran.`
              : `Odaberite grupu u koju želite upisati ${childName}.`}
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
              {loadingGroups ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  Učitavam grupe...
                </p>
              ) : loadedGroups.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  {!selectedCourseId
                    ? 'Najprije odaberite program.'
                    : 'Nema dostupnih grupa za ovaj program.'}
                </p>
              ) : (
                loadedGroups.map((g) => {
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
                        name="group"
                        value={g.id}
                        checked={selectedGroupId === g.id}
                        onChange={() => handleGroupSelect(g.id)}
                        className="h-4 w-4 border-gray-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="text-sm text-gray-800">{label}</span>
                    </label>
                  )
                })
              )}
            </div>

            {isStandardCourse && courseModules.length > 0 && (
              <div className="py-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Moduli
                </label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 cursor-pointer border-b border-gray-100 pb-2 mb-1">
                    <input
                      type="checkbox"
                      checked={courseModules.length > 0 && selectedModuleIds.length === courseModules.length}
                      onChange={() => {
                        if (selectedModuleIds.length === courseModules.length) {
                          setSelectedModuleIds([])
                        } else {
                          setSelectedModuleIds(courseModules.map((m) => m.id))
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-sm font-medium text-gray-800">Svi moduli</span>
                  </label>
                  {courseModules.map((mod) => {
                    let dateRange = ''
                    if (mod.startDate && mod.endDate) {
                      const s = new Date(mod.startDate)
                      const e = new Date(mod.endDate)
                      const sd = `${String(s.getDate()).padStart(2, '0')}.${String(s.getMonth() + 1).padStart(2, '0')}.`
                      const ed = `${String(e.getDate()).padStart(2, '0')}.${String(e.getMonth() + 1).padStart(2, '0')}.${e.getFullYear()}.`
                      dateRange = ` (${sd} – ${ed})`
                    }
                    return (
                      <label
                        key={mod.id}
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedModuleIds.includes(mod.id)}
                          onChange={() => toggleModuleId(mod.id)}
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
                disabled={isPending || !selectedGroupId || (isStandardCourse && selectedModuleIds.length === 0)}
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Kreiram...' : 'Kreiraj račun i upiši'}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
