'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { fromDateKey } from '@/lib/session-dates'
import {
  bulkImportHolidays,
  previewHolidaysFromApi,
  type HolidayPreviewItem,
} from '@/actions/admin/holidays'

type Props = {
  schoolYear: string
  archived: boolean
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: HolidayPreviewItem[] }

type Conflict = { attendanceCount: number; dates: string[] } | null

function itemRangeLabel(item: HolidayPreviewItem): string {
  if (item.kind === 'single') return formatDate(fromDateKey(item.date))
  return `${formatDate(fromDateKey(item.startDate))} – ${formatDate(fromDateKey(item.endDate))}`
}

function defaultSelectedSet(items: HolidayPreviewItem[]): Set<number> {
  // Auto-check everything that isn't already in the DB.
  const s = new Set<number>()
  items.forEach((item, i) => {
    if (!item.existing) s.add(i)
  })
  return s
}

export function HolidayImportDialog({ schoolYear, archived }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [conflict, setConflict] = useState<Conflict>(null)
  const [isPending, startTransition] = useTransition()

  async function loadPreview() {
    setState({ status: 'loading' })
    setConflict(null)
    const res = await previewHolidaysFromApi(schoolYear)
    if (!res.success) {
      setState({ status: 'error', message: res.error })
      return
    }
    setState({ status: 'ready', items: res.items })
    setSelected(defaultSelectedSet(res.items))
  }

  function openDialog() {
    setOpen(true)
    void loadPreview()
  }

  function closeDialog() {
    if (isPending) return
    setOpen(false)
    setState({ status: 'idle' })
    setSelected(new Set())
    setConflict(null)
  }

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
    // Any edit invalidates the prior conflict snapshot — selection changed,
    // so attendance counts may differ.
    if (conflict) setConflict(null)
  }

  function selectAll(items: HolidayPreviewItem[]) {
    setSelected(new Set(items.map((_, i) => i)))
    if (conflict) setConflict(null)
  }

  function clearSelection() {
    setSelected(new Set())
    if (conflict) setConflict(null)
  }

  function handleSubmit(confirmDeleteAttendance = false) {
    if (state.status !== 'ready') return
    const items = state.items
    const payload = Array.from(selected)
      .sort((a, b) => a - b)
      .map((i) => items[i])
      .filter((it): it is HolidayPreviewItem => Boolean(it))
      .map<{ kind: 'single'; date: string; name: string } | { kind: 'range'; startDate: string; endDate: string; name: string }>(
        (it) =>
          it.kind === 'single'
            ? { kind: 'single', date: it.date, name: it.name }
            : { kind: 'range', startDate: it.startDate, endDate: it.endDate, name: it.name },
      )

    if (payload.length === 0) {
      toast.error('Odaberite barem jedan praznik.')
      return
    }

    startTransition(async () => {
      const res = await bulkImportHolidays({
        schoolYear,
        items: payload,
        confirmDeleteAttendance,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      if (res.requiresConfirmation) {
        setConflict({ attendanceCount: res.attendanceCount, dates: res.conflictDates })
        return
      }
      toast.success(
        `Učitano ${res.importedCount} ${res.importedCount === 1 ? 'praznik' : res.importedCount < 5 ? 'praznika' : 'praznika'}.`,
      )
      setOpen(false)
      setState({ status: 'idle' })
      setSelected(new Set())
      setConflict(null)
      router.refresh()
    })
  }

  if (archived) return null

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={openDialog}
        className="gap-2"
        data-testid="open-holiday-import"
      >
        <Download className="h-4 w-4" />
        Učitaj iz kalendara MZO-a
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Učitaj praznike za {schoolYear}</DialogTitle>
            <DialogDescription>
              Podaci se dohvaćaju s OpenHolidaysAPI (Narodne novine – odluka MZO-a).
              Odaberite koje praznike želite spremiti u kalendar školske godine.
            </DialogDescription>
          </DialogHeader>

          <DialogBody state={state} selected={selected} toggle={toggle} onRetry={loadPreview} />

          {state.status === 'ready' && state.items.length > 0 && (
            <SelectionControls
              total={state.items.length}
              selectedCount={selected.size}
              onSelectAll={() => selectAll(state.items)}
              onClear={clearSelection}
            />
          )}

          {conflict && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                Postoji <strong>{conflict.attendanceCount}</strong>{' '}
                {conflict.attendanceCount === 1 ? 'zapis' : 'zapisa'} dolaska na{' '}
                <strong>{conflict.dates.length}</strong>{' '}
                {conflict.dates.length === 1 ? 'datum' : 'datuma'}. Spremanjem će biti obrisani.
                <div className="mt-1 text-xs text-amber-800">
                  {conflict.dates.map((d) => formatDate(fromDateKey(d))).join(', ')}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>
              Odustani
            </Button>
            <Button
              type="button"
              variant={conflict ? 'destructive' : 'default'}
              onClick={() => handleSubmit(Boolean(conflict))}
              disabled={isPending || state.status !== 'ready' || selected.size === 0}
            >
              {conflict ? 'Da, obriši dolaske i spremi' : `Spremi (${selected.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DialogBody({
  state,
  selected,
  toggle,
  onRetry,
}: Readonly<{
  state: LoadState
  selected: Set<number>
  toggle: (idx: number) => void
  onRetry: () => void
}>) {
  if (state.status === 'loading') {
    return (
      <div className="space-y-2" data-testid="holiday-import-loading">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
        <div className="flex-1">
          <p className="font-medium">Greška pri dohvaćanju praznika.</p>
          <p className="mt-0.5 text-xs text-red-800">{state.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
          >
            <RefreshCw className="h-3 w-3" />
            Pokušaj ponovno
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'ready' && state.items.length === 0) {
    return (
      <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        Nema dostupnih praznika za odabranu školsku godinu.
      </p>
    )
  }

  if (state.status !== 'ready') return null

  const publicItems = state.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.category === 'public')
  const schoolItems = state.items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.category === 'school')

  return (
    <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
      <Group
        title="Državni blagdani"
        rows={publicItems}
        selected={selected}
        toggle={toggle}
        emptyMessage="OpenHolidaysAPI nije vratio državne blagdane."
      />
      <Group
        title="Školski praznici"
        rows={schoolItems}
        selected={selected}
        toggle={toggle}
        emptyMessage={
          'Školski praznici još nisu dostupni za ovu školsku godinu — unesite ih ručno kad MZO objavi odluku.'
        }
        emptyIsWarning
      />
    </div>
  )
}

function Group({
  title,
  rows,
  selected,
  toggle,
  emptyMessage,
  emptyIsWarning = false,
}: Readonly<{
  title: string
  rows: Array<{ item: HolidayPreviewItem; idx: number }>
  selected: Set<number>
  toggle: (idx: number) => void
  emptyMessage: string
  emptyIsWarning?: boolean
}>) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p
          className={cn(
            'rounded-md px-3 py-2 text-xs',
            emptyIsWarning
              ? 'border border-amber-200 bg-amber-50 text-amber-900'
              : 'border border-gray-200 bg-gray-50 text-gray-700',
          )}
          data-testid={emptyIsWarning ? 'school-holidays-empty-warning' : undefined}
        >
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ item, idx }) => (
            <li key={idx}>
              <PreviewRow
                item={item}
                checked={selected.has(idx)}
                onToggle={() => toggle(idx)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PreviewRow({
  item,
  checked,
  onToggle,
}: Readonly<{
  item: HolidayPreviewItem
  checked: boolean
  onToggle: () => void
}>) {
  const idTag = item.kind === 'single' ? item.date : `${item.startDate}-${item.endDate}`
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors',
        checked
          ? 'border-cyan-300 bg-cyan-50/40 hover:bg-cyan-50'
          : 'border-gray-200 bg-white hover:bg-gray-50',
        item.existing && 'opacity-80',
      )}
      data-testid="holiday-import-row"
      data-holiday-key={idTag}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-gray-900">{item.name}</span>
          {item.kind === 'range' && (
            <span className="text-xs text-gray-500">({item.dayCount} dana)</span>
          )}
        </div>
        <div className="text-xs text-gray-600">{itemRangeLabel(item)}</div>
      </div>
      {item.existing && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-600">
          Već postoji
        </span>
      )}
      {item.attendanceCount > 0 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">
          {item.attendanceCount} dolazak{item.attendanceCount === 1 ? '' : 'a'}
        </span>
      )}
    </label>
  )
}

function SelectionControls({
  total,
  selectedCount,
  onSelectAll,
  onClear,
}: Readonly<{
  total: number
  selectedCount: number
  onSelectAll: () => void
  onClear: () => void
}>) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
      <span>
        Označeno: <strong className="text-gray-900">{selectedCount}</strong> / {total}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded px-2 py-1 font-medium text-cyan-700 hover:bg-cyan-50"
        >
          Označi sve
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-2 py-1 font-medium text-gray-700 hover:bg-gray-100"
        >
          Očisti
        </button>
      </div>
    </div>
  )
}
