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
}

export function EmailPreviewDialog({ open, onOpenChange, html }: Readonly<EmailPreviewDialogProps>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pregled e-maila</DialogTitle>
          <DialogDescription>Ovako će poruka izgledati roditelju.</DialogDescription>
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
