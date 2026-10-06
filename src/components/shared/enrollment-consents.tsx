'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AdminActionResult } from '@/lib/action-types'
import {
  CONSENT_KEYS,
  CONSENT_LABELS,
  pickConsents,
  type ConsentKey,
  type EnrollmentConsents,
} from '@/lib/enrollment-consent'
import { cn } from '@/lib/utils'

type SetConsentsAction = (
  input: EnrollmentConsents & { enrollmentId: string },
) => Promise<AdminActionResult>

interface Props {
  enrollmentId: string
  consents: EnrollmentConsents
  /** Named in the dialog: a child can hold several enrollments in one year. */
  groupLabel?: string
  /**
   * Admin only. Absent = read-only, which is what a teacher gets: they see the
   * consents so they know whom not to photograph, but only the office enters
   * the signed forms.
   */
  onSetConsents?: SetConsentsAction
}

type ConsentValue = boolean | null

const STATE_OPTIONS: ReadonlyArray<{ value: ConsentValue; label: string }> = [
  { value: true, label: 'Da' },
  { value: false, label: 'Ne' },
  { value: null, label: 'Nije uneseno' },
]

function StatePill({ value }: Readonly<{ value: ConsentValue }>) {
  if (value === true) {
    return (
      <span className="rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
        Da
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
        Ne
      </span>
    )
  }
  return (
    <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-500">
      Nije uneseno
    </span>
  )
}

/**
 * The four privole of one enrollment. Edited through a dialog that saves all
 * four at once rather than as four one-click toggles: the answers arrive
 * together on one signed form, and the dialog is the deliberate step the
 * "no mark changes on one click" rule asks for — a stray Da here is a photo
 * that goes out against the family's wishes.
 */
export function EnrollmentConsents({
  enrollmentId,
  consents,
  groupLabel,
  onSetConsents,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">Privole</p>
        {onSetConsents && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-cyan-700"
          >
            <Pencil className="w-3 h-3" />
            Uredi privole
          </button>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {CONSENT_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <dt className="text-xs text-gray-600">{CONSENT_LABELS[key]}</dt>
            <dd>
              <StatePill value={consents[key]} />
            </dd>
          </div>
        ))}
      </dl>
      {onSetConsents && open && (
        <ConsentsDialog
          enrollmentId={enrollmentId}
          initial={consents}
          groupLabel={groupLabel}
          onSetConsents={onSetConsents}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

interface DialogProps {
  enrollmentId: string
  initial: EnrollmentConsents
  groupLabel?: string
  onSetConsents: SetConsentsAction
  onClose: () => void
}

// Mounted only while open, so every opening starts from what is stored rather
// than from an abandoned edit.
function ConsentsDialog({
  enrollmentId,
  initial,
  groupLabel,
  onSetConsents,
  onClose,
}: Readonly<DialogProps>) {
  const router = useRouter()
  const [draft, setDraft] = useState<EnrollmentConsents>(() => pickConsents(initial))
  const [isPending, startTransition] = useTransition()

  const set = (key: ConsentKey, value: ConsentValue) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const handleSave = () => {
    startTransition(async () => {
      const res = await onSetConsents({ enrollmentId, ...draft })
      if (res.success) {
        toast.success('Privole spremljene.')
        onClose()
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri spremanju privola.')
      }
    })
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Privole uz ugovor</DialogTitle>
          <DialogDescription>
            Upišite odgovore s obrasca koji je roditelj potpisao.
            {groupLabel ? ` Upis: ${groupLabel}.` : ''} Dok privola nije unesena,
            vrijedi kao da nije dana.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {CONSENT_KEYS.map((key) => (
            <div key={key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-gray-800">{CONSENT_LABELS[key]}</span>
              <fieldset className="flex gap-1 self-start sm:self-auto rounded-lg bg-gray-100 p-1">
                <legend className="sr-only">{CONSENT_LABELS[key]}</legend>
                {STATE_OPTIONS.map((option) => {
                  const active = draft[key] === option.value
                  return (
                    <label
                      key={option.label}
                      className={cn(
                        'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-500',
                        active && option.value === true && 'bg-green-600 text-white',
                        active && option.value === false && 'bg-red-600 text-white',
                        active && option.value === null && 'bg-white text-gray-800 shadow-sm',
                        !active && 'text-gray-600 hover:text-gray-900',
                      )}
                    >
                      <input
                        type="radio"
                        name={key}
                        className="sr-only"
                        checked={active}
                        onChange={() => set(key, option.value)}
                      />
                      {option.label}
                    </label>
                  )
                })}
              </fieldset>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setDraft({ consentGallery: true, consentWebsite: true, consentSocial: true, consentEmail: true })
            }
            className="text-xs text-cyan-700 hover:text-cyan-900"
          >
            Označi sve „Da”
          </button>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Spremam...' : 'Spremi'}
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
