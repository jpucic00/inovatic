'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  /**
   * Year the panel opens on — the admin's sidebar-selected year, NOT
   * `computeSchoolYear()`. An admin who switched the section to next year is
   * planning next year's assignments; every other admin list already follows
   * that choice, and this one must not be the outlier that forces two switches.
   */
  defaultYear: string
  /**
   * `computeSchoolYear()` from the server, so "is this year archived?" is a
   * plain string comparison here instead of a clock read during render — same
   * reasoning as the payment panel's server-computed month boundary.
   */
  currentYear: string
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
  defaultYear,
  currentYear,
}: Readonly<Props>) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [activeYear, setActiveYear] = useState(defaultYear)
  const [assignYear, setAssignYear] = useState(defaultYear)

  // `activeYear` is in the set on purpose: it keeps the open tab visible across
  // the two moments the derived list would otherwise drop it — right after an
  // assign into a year the teacher had none of (the row lands on the next
  // router.refresh()), and after unassigning a year's last group.
  const years = useMemo(() => {
    const set = new Set<string>([defaultYear, activeYear])
    for (const a of assignments) set.add(a.scheduledGroup.schoolYear)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [assignments, defaultYear, activeYear])

  const yearAssignments = assignments.filter(
    (a) => a.scheduledGroup.schoolYear === activeYear,
  )

  // Every year the city has groups in. `assignableGroups` is exactly "all city
  // groups minus this teacher's own", so unioning it with the assignments'
  // years reconstructs the full set without a second query. A year whose groups
  // are ALL already assigned stays listed on purpose — it explains itself in
  // the dialog rather than silently going missing, which reads as a bug.
  const dialogYears = useMemo(() => {
    const set = new Set<string>()
    for (const g of assignableGroups) set.add(g.schoolYear)
    for (const a of assignments) set.add(a.scheduledGroup.schoolYear)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [assignableGroups, assignments])

  const yearAssignableGroups = assignableGroups.filter((g) => g.schoolYear === assignYear)

  // An archived year is view-only — `assignTeacherToGroup` refuses it at submit.
  // Its groups still list (dropping the year would read as missing data, the way
  // a fully-assigned year did), but the dialog says so and Dodijeli is dead.
  const isArchived = (year: string) => year < currentYear
  const assignYearArchived = isArchived(assignYear)

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Open on the year being viewed, but only if something there can actually
      // be assigned; otherwise the newest year that can. A free group in an
      // archived year does not count — that year refuses at submit — and when
      // no year is assignable at all, still prefer a live one: "sve grupe već
      // dodijeljene" is a state the admin can act on, an archived year is not.
      const isOpenable = (y: string) =>
        !isArchived(y) && assignableGroups.some((g) => g.schoolYear === y)
      const openable = isOpenable(activeYear)
        ? activeYear
        : dialogYears.find(isOpenable)
      setAssignYear(openable ?? dialogYears.find((y) => !isArchived(y)) ?? activeYear)
      setSelectedGroupId('')
    }
    setAdding(next)
  }

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
        // The admin may have assigned into a year other than the one on screen —
        // follow it, or the panel reads as "nothing happened".
        setActiveYear(assignYear)
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
        {assignableGroups.length > 0 && (
          <Dialog open={adding} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Dodijeli grupu
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Dodijeli grupu</DialogTitle>
                <DialogDescription>
                  Odaberite školsku godinu, pa grupu iz te godine.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="assign-year-select"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Školska godina
                  </label>
                  <select
                    id="assign-year-select"
                    value={assignYear}
                    onChange={(e) => {
                      setAssignYear(e.target.value)
                      // A group id from the previous year would still submit.
                      setSelectedGroupId('')
                    }}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {dialogYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  {assignYearArchived && (
                    <p className="mt-1 text-xs text-amber-700">
                      Arhivirana školska godina je samo za pregled — dodjela nije
                      moguća.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="assign-group-select"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Grupa
                  </label>
                  <select
                    id="assign-group-select"
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="">– Odaberite grupu –</option>
                    {yearAssignableGroups.map((g) => {
                      const label = [
                        g.course.title,
                        g.name,
                        formatSchedule(g),
                        g.location.name,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                      // No year in the label — the year select above owns it.
                      return (
                        <option key={g.id} value={g.id}>
                          {label}
                        </option>
                      )
                    })}
                  </select>
                  {!assignYearArchived && yearAssignableGroups.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Sve grupe u {assignYear} već su dodijeljene ovom nastavniku.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <button
                    onClick={() => handleOpenChange(false)}
                    disabled={isPending}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Odustani
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={isPending || !selectedGroupId || assignYearArchived}
                    className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
                  >
                    {isPending ? 'Dodjeljujem...' : 'Dodijeli'}
                  </button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {assignments.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-500">Školska godina:</span>
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 rounded-lg border-0 bg-gray-100 p-1">
            {/* Not "Školska godina" — the assign dialog's select carries that
                accessible name, and the two must stay distinguishable. */}
            <legend className="sr-only">Odabir školske godine</legend>
            {years.map((y) => {
              const isActive = y === activeYear
              return (
                <button
                  key={y}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveYear(y)}
                  className={[
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    isActive
                      ? 'bg-white text-cyan-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900',
                  ].join(' ')}
                >
                  {y}
                </button>
              )
            })}
          </fieldset>
        </div>
      )}

      {assignments.length === 0 && (
        <p className="text-sm text-gray-400 italic">Još nema dodijeljenih grupa.</p>
      )}
      {assignments.length > 0 && yearAssignments.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          Nema dodijeljenih grupa u {activeYear}.
        </p>
      )}
      {yearAssignments.length > 0 && (
        <div className="space-y-2">
          {yearAssignments.map((a) => (
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
              {/* No per-row year badge — the active tab already names it. */}
              <div className="flex items-center gap-2 shrink-0">
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
