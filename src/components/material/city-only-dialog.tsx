'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import type { City } from '@prisma/client'
import { makeMaterialShared, setMaterialCityOnly } from '@/actions/admin/material-city'
import { CITY_LABELS, CITY_VALUES } from '@/lib/city'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Mirrors the server's `reason.trim().min(5)` in `setMaterialCityOnly`. */
const CITY_ONLY_REASON_MIN = 5
/** Mirrors the server's `.max(500)`. */
const CITY_ONLY_REASON_MAX = 500

export function isCityOnlyReasonValid(reason: string): boolean {
  const length = reason.trim().length
  return length >= CITY_ONLY_REASON_MIN && length <= CITY_ONLY_REASON_MAX
}

function otherCityOf(city: City): City {
  return CITY_VALUES.find((c) => c !== city) ?? city
}

const actionClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-60 sm:min-h-8'

interface MaterialCityActionProps {
  materialId: string
  title: string
  /** The row's current city: null = both cities. */
  city: City | null | undefined
  /** The admin's own city — the only one they can limit a material to. */
  viewerCity: City
}

/**
 * The quiet per-row switch between "both cities" and "only mine".
 *
 * Limiting asks for a reason; returning does not. The asymmetry is the owner's
 * rule (2026-10-10): the curriculum is the same in Split and Šibenik, so taking
 * a material away from the other city is the deliberate, explained exception,
 * while putting it back is the norm and needs no ceremony.
 *
 * Renders nothing for a row another city limited — that one is theirs to undo.
 */
export function MaterialCityAction({
  materialId,
  title,
  city,
  viewerCity,
}: Readonly<MaterialCityActionProps>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (city && city !== viewerCity) return null

  if (city === viewerCity) {
    const restore = () => {
      startTransition(async () => {
        const res = await makeMaterialShared({ materialId })
        if (res.success) {
          toast.success(`„${title}" ponovno vrijedi u oba grada.`)
          router.refresh()
        } else {
          toast.error(res.error)
        }
      })
    }
    return (
      <button type="button" disabled={isPending} onClick={restore} className={actionClass}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
        Vrati u oba grada
      </button>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={actionClass}>
        <MapPin className="h-3.5 w-3.5" />
        Samo za {CITY_LABELS[viewerCity]}…
      </button>
      <CityOnlyDialog
        open={open}
        onOpenChange={setOpen}
        materialId={materialId}
        title={title}
        viewerCity={viewerCity}
      />
    </>
  )
}

interface CityOnlyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  materialId: string
  title: string
  viewerCity: City
}

/**
 * "Samo za Split?" — names the city that loses the material, because that is
 * what the click actually does, and asks why. The reason is shown to the other
 * city's admin beside the greyed row, so it has to say something.
 */
export function CityOnlyDialog({
  open,
  onOpenChange,
  materialId,
  title,
  viewerCity,
}: Readonly<CityOnlyDialogProps>) {
  const router = useRouter()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const own = CITY_LABELS[viewerCity]
  const other = CITY_LABELS[otherCityOf(viewerCity)]
  const valid = isCityOnlyReasonValid(reason)
  const length = reason.trim().length

  const close = (next: boolean) => {
    if (isPending) return
    onOpenChange(next)
    if (!next) setReason('')
  }

  const submit = () => {
    if (!valid || isPending) return
    startTransition(async () => {
      const res = await setMaterialCityOnly({ materialId, reason: reason.trim() })
      if (res.success) {
        toast.success(`„${title}" sada vrijedi samo za ${own}.`)
        onOpenChange(false)
        setReason('')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Samo za {own}?</DialogTitle>
          <DialogDescription>
            {other} neće dobiti ovaj materijal. Kurikulum je isti u oba grada — ovo koristite samo
            za materijal koji drugom gradu nije relevantan.
          </DialogDescription>
          <p className="text-xs text-gray-500 break-words">{`„${title}"`}</p>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium text-gray-700">
              Zašto ne vrijedi za {other}? <span className="text-red-500">*</span>
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={CITY_ONLY_REASON_MAX}
              required
              aria-describedby={`${reasonId}-hint`}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p id={`${reasonId}-hint`} className="mt-1 text-xs text-gray-500">
              {length < CITY_ONLY_REASON_MIN
                ? `Barem ${CITY_ONLY_REASON_MIN} znakova — razlog vide i admini drugog grada.`
                : 'Razlog vide i admini drugog grada.'}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={isPending}>
              Odustani
            </Button>
            <Button type="submit" disabled={!valid || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Ograniči na {own}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
