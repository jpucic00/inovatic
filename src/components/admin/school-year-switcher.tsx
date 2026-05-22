'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { setSelectedSchoolYear, createSchoolYear } from '@/actions/admin/school-year'
import { getNextSchoolYear, isArchivedYear } from '@/lib/school-year'

interface SchoolYearSwitcherProps {
  years: string[]
  selectedYear: string
  currentYear: string
}

export function SchoolYearSwitcher({
  years,
  selectedYear,
  currentYear,
}: Readonly<SchoolYearSwitcherProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const archived = isArchivedYear(selectedYear)
  const nextYear = getNextSchoolYear(years[0] ?? currentYear)

  function handleSelect(year: string) {
    if (year === selectedYear) return
    startTransition(async () => {
      const res = await setSelectedSchoolYear(year)
      if (res.success) {
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška.')
      }
    })
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createSchoolYear()
      if (res.success) {
        toast.success(`Školska godina ${nextYear} kreirana.`)
        setConfirmOpen(false)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška.')
      }
    })
  }

  return (
    <div className="px-3 py-3 border-b border-gray-800">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-1.5 px-0.5">
        Školska godina
      </p>
      <div className="flex items-center gap-1.5">
        <Select value={selectedYear} onValueChange={handleSelect} disabled={isPending}>
          <SelectTrigger
            className="flex-1 h-9 bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700 focus-visible:ring-cyan-500/40"
            aria-label="Odaberi školsku godinu"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            className="bg-gray-800 border-gray-700 text-gray-100"
          >
            {years.map((year) => (
              <SelectItem
                key={year}
                value={year}
                className="text-gray-100 focus:bg-gray-700 focus:text-white"
              >
                <span className="flex items-center gap-1.5">
                  {year}
                  {year === currentYear && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          title="Nova školska godina"
          aria-label="Nova školska godina"
          className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {archived && (
        <p className="mt-1.5 text-[11px] text-amber-400/90 px-0.5">
          Arhiva — samo za pregled
        </p>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova školska godina</DialogTitle>
            <DialogDescription>
              Kreirati školsku godinu <strong>{nextYear}</strong>? Nova godina počinje
              prazna — bez grupa i bez rasporeda modula.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Kreiram...' : `Kreiraj ${nextYear}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
