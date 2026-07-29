'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EmailPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  html: string | null
  /**
   * Who this preview is for. Names the actual recipient when previewing one row
   * of an evaluation send — the point of that preview is confirming the card
   * belongs to the child named here, which a generic caption cannot do.
   */
  description?: string
}

export function EmailPreviewDialog({
  open,
  onOpenChange,
  html,
  description,
}: Readonly<EmailPreviewDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pregled e-maila</DialogTitle>
          <DialogDescription>
            {description ?? 'Ovako će poruka izgledati roditelju.'}
          </DialogDescription>
        </DialogHeader>
        {html ? (
          <iframe
            srcDoc={html}
            sandbox=""
            title="Pregled e-maila"
            className="h-[70vh] w-full rounded-lg border border-gray-200 bg-white"
          />
        ) : (
          <p className="text-sm text-gray-400 italic py-10 text-center">Učitavam pregled...</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
