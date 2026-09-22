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
import { Hourglass } from 'lucide-react'
import { toast } from 'sonner'
import { getWaitlistGroupOptions, setInquiryWaitlist } from '@/actions/admin/inquiry'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'
import type { WaitlistGroupView } from '@/lib/waitlist'

const MAX_NOTE_LENGTH = 1000

interface WaitlistDialogProps {
  inquiryId: string
  childName: string
  courses: { id: string; title: string }[]
  initialCourseId: string
  initialGroups: WaitlistGroupView[]
  initialSelectedIds: string[]
  initialNote: string
  /** The group the parent picked on the form — marked so the admin sees what is being left. */
  originalGroupId: string | null
  /** True for a NEW upit holding a seat: waitlisting releases it, and the dialog says so. */
  releasesSeat: boolean
  isEditing: boolean
  /** Renders the smaller "Uredi" trigger used on the waitlist card. */
  compactTrigger?: boolean
}

export function WaitlistDialog({
  inquiryId,
  childName,
  courses,
  initialCourseId,
  initialGroups,
  initialSelectedIds,
  initialNote,
  originalGroupId,
  releasesSeat,
  isEditing,
  compactTrigger = false,
}: Readonly<WaitlistDialogProps>) {
  const [open, setOpen] = useState(false)
  const [courseId, setCourseId] = useState(initialCourseId)
  const [groups, setGroups] = useState<WaitlistGroupView[]>(initialGroups)
  const [selected, setSelected] = useState<string[]>(initialSelectedIds)
  const [note, setNote] = useState(initialNote)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const canSubmit = (selected.length > 0 || note.trim().length > 0) && !isPending

  const reset = () => {
    setCourseId(initialCourseId)
    setGroups(initialGroups)
    setSelected(initialSelectedIds)
    setNote(initialNote)
  }

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    setOpen(next)
    if (!next) reset()
  }

  const handleCourseChange = async (next: string) => {
    setCourseId(next)
    // Groups belong to one program per entry, so a program switch clears the picks.
    setSelected([])
    if (!next) {
      setGroups([])
      return
    }
    setLoadingGroups(true)
    try {
      setGroups(await getWaitlistGroupOptions(inquiryId, next))
    } catch {
      toast.error('Greška pri učitavanju grupa.')
      setGroups([])
    } finally {
      setLoadingGroups(false)
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))

  const handleSave = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const result = await setInquiryWaitlist({ id: inquiryId, groupIds: selected, note })
      if (result.success) {
        toast.success(isEditing ? 'Lista čekanja ažurirana.' : 'Upit je stavljen na listu čekanja.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {compactTrigger ? (
          <button className="px-3 py-1.5 text-sm font-medium text-orange-800 bg-white border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors">
            Uredi
          </button>
        ) : (
          <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-800 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
            <Hourglass className="w-4 h-4" />
            {isEditing ? 'Uredi listu čekanja' : 'Na listu čekanja'}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Uredi listu čekanja' : 'Stavi na listu čekanja'}</DialogTitle>
          <DialogDescription>
            Odaberite grupe koje <strong>{childName}</strong> može pohađati. Kad se u nekoj od njih
            oslobodi mjesto, upit će na listi čekanja biti označen s „Slobodno mjesto”.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="waitlist-course" className="block text-sm font-medium text-gray-700">
              Program
            </label>
            <select
              id="waitlist-course"
              value={courseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              disabled={isPending}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">Odaberite program</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-1">
            <legend className="block text-sm font-medium text-gray-700 mb-1">
              Prihvatljive grupe
            </legend>
            {loadingGroups && <p className="text-sm text-gray-500">Učitavam grupe…</p>}
            {!loadingGroups && courseId && groups.length === 0 && (
              <p className="text-sm italic text-gray-500">
                Ovaj program nema grupa u školskoj godini upita.
              </p>
            )}
            {!loadingGroups && groups.length > 0 && (
              <ul className="max-h-64 overflow-y-auto divide-y rounded-lg border">
                {groups.map((g) => (
                  <li key={g.id}>
                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selected.includes(g.id)}
                        onChange={() => toggle(g.id)}
                        disabled={isPending}
                        className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-900">
                          {[g.name, g.schedule].filter(Boolean).join(' · ')}
                          {g.id === originalGroupId && (
                            <span className="ml-1 text-xs text-gray-500">(prvotno odabrana)</span>
                          )}
                        </span>
                        <span className="block text-xs text-gray-500">{g.locationName}</span>
                      </span>
                      <GroupCapacityChip availableSpots={g.availableSpots} isFull={g.isFull} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500">
              Popunjene grupe se mogu odabrati — upravo zato obitelj čeka.
            </p>
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="waitlist-note" className="block text-sm font-medium text-gray-700">
              Napomena
            </label>
            <textarea
              id="waitlist-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE_LENGTH}
              rows={3}
              disabled={isPending}
              placeholder="npr. može samo utorkom ili četvrtkom poslije 17 h"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
            />
          </div>

          {releasesSeat && !isEditing && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Mjesto koje upit drži u prvotno odabranoj grupi bit će oslobođeno za druge.
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
            onClick={handleSave}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Spremam...' : 'Spremi'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
