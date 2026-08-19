'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmRequest {
  title: string
  /** What is about to change. Inline nodes only — this lands inside a <p>. */
  description: ReactNode
  /** Which row the change belongs to, e.g. the group. Muted line under the description. */
  context?: string
  confirmLabel: string
  /**
   * Paints the confirm button red. Reserved for taking an existing mark AWAY —
   * setting one is ordinary bookkeeping, undoing one throws a date on the floor.
   */
  destructive?: boolean
  onConfirm: () => void
}

interface Props {
  /** The pending question, or `null` when nothing is being confirmed. */
  request: ConfirmRequest | null
  onClose: () => void
}

/**
 * A yes/no modal for marks that are one click away and easy to hit by accident.
 *
 * Deliberately NOT `globalThis.confirm()`, which the delete buttons elsewhere
 * use: those name a whole object ("Obrisati materijal X?"), while these marks
 * sit in a dense row of near-identical chips, so the question has to name the
 * exact chip AND the enrollment it belongs to — more than a browser prompt can
 * carry, and a child in two groups has the same module titles in both.
 *
 * Controlled by a request object rather than a trigger: the caller has one
 * dialog and many buttons, and each button's closure is what carries the copy
 * and the action.
 */
export function ConfirmDialog({ request, onClose }: Readonly<Props>) {
  // The request is remembered through the close animation. Rendering straight
  // off `request` empties the box the moment it goes null, and Radix keeps the
  // node mounted for the fade — so the last thing seen would be a blank dialog
  // rather than the question just answered.
  const [shown, setShown] = useState<ConfirmRequest | null>(request)
  useEffect(() => {
    if (request) setShown(request)
  }, [request])

  const confirm = () => {
    shown?.onConfirm()
    onClose()
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{shown?.title}</DialogTitle>
          <DialogDescription>{shown?.description}</DialogDescription>
          {shown?.context && (
            <p className="text-xs text-gray-500">{shown.context}</p>
          )}
        </DialogHeader>
        <DialogFooter>
          {/* First in the DOM, so it takes the dialog's initial focus and a
              stray Enter cancels rather than confirms. */}
          <Button type="button" variant="outline" onClick={onClose}>
            Odustani
          </Button>
          <Button
            type="button"
            variant={shown?.destructive ? 'destructive' : 'default'}
            onClick={confirm}
          >
            {shown?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
