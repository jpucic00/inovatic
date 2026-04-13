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
import { CalendarDays } from 'lucide-react'
import { sendScheduleOptions, getGroupsForCourse } from '@/actions/admin/inquiry'
import { toast } from 'sonner'

interface GroupOption {
  id: string
  name: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  location: { name: string }
}

interface CourseOption {
  id: string
  title: string
}

interface SendScheduleDialogProps {
  inquiryId: string
  childName: string
  initialGroups: GroupOption[]
  courses: CourseOption[]
  preferredCourseId?: string
}

export function SendScheduleDialog({
  inquiryId,
  childName,
  initialGroups,
  courses,
  preferredCourseId,
}: Readonly<SendScheduleDialogProps>) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [selectedCourseId, setSelectedCourseId] = useState(preferredCourseId ?? '')
  const [loadedGroups, setLoadedGroups] = useState<GroupOption[]>(initialGroups)
  const [loadingGroups, setLoadingGroups] = useState(false)

  const handleCourseChange = async (courseId: string) => {
    setSelectedCourseId(courseId)
    setSelectedIds([])
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
        })),
      )
    } finally {
      setLoadingGroups(false)
    }
  }

  const toggleGroup = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleSend = () => {
    if (selectedIds.length === 0) {
      toast.error('Odaberite barem jednu grupu.')
      return
    }
    startTransition(async () => {
      const result = await sendScheduleOptions(inquiryId, selectedIds)
      if (result.success) {
        toast.success('Raspored poslan roditelju.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška pri slanju.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
          <CalendarDays className="w-4 h-4" />
          Pošalji raspored
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pošalji dostupne termine</DialogTitle>
          <DialogDescription>
            Odaberite grupe čije termine želite poslati roditelju djeteta{' '}
            <strong>{childName}</strong>. E-mail s ponuđenim terminima bit će
            poslan automatski.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label htmlFor="schedule-course-select" className="block text-sm font-medium text-gray-700 mb-1.5">
            Program
          </label>
          <select
            id="schedule-course-select"
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
              const checked = selectedIds.includes(g.id)
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
                    checked
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleGroup(g.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-800">{label}</span>
                </label>
              )
            })
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
            onClick={handleSend}
            disabled={isPending || selectedIds.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Šaljem...' : `Pošalji (${selectedIds.length})`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
