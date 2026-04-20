'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Copy, CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { resetTeacherPassword } from '@/actions/admin/teacher'
import { toast } from 'sonner'

interface Props {
  teacherId: string
  teacherEmail: string
}

export function ResetPasswordButton({ teacherId, teacherEmail }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ password: string; emailSent: boolean } | null>(null)

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await resetTeacherPassword(teacherId)
      if (res.success) {
        setResult(res)
        toast.success('Nova lozinka postavljena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleClose = () => {
    setOpen(false)
    setResult(null)
  }

  const copyCredentials = () => {
    if (!result) return
    const text = `E-mail: ${teacherEmail}\nLozinka: ${result.password}`
    navigator.clipboard.writeText(text)
    toast.success('Podaci kopirani.')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(o) : handleClose())}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
          <KeyRound className="w-3.5 h-3.5" />
          Resetiraj lozinku
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {result ? 'Nova lozinka' : 'Resetiraj lozinku'}
          </DialogTitle>
          <DialogDescription>
            {result
              ? result.emailSent
                ? 'Nova lozinka poslana je na e-mail nastavnika.'
                : 'Nova lozinka je postavljena. E-mail nije poslan — podijelite podatke ručno.'
              : 'Ovo će generirati novu privremenu lozinku. Postojeća lozinka prestaje vrijediti.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            {result.emailSent && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-800">
                  Podaci poslani na <strong>{teacherEmail}</strong>.
                </p>
              </div>
            )}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-medium text-green-800 mb-2">Nova lozinka</p>
              <p className="font-mono text-sm text-gray-800">{result.password}</p>
              <button
                onClick={copyCredentials}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Kopiraj podatke
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Zatvori
              </button>
            </div>
          </div>
        ) : (
          <DialogFooter>
            <button
              onClick={handleClose}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Resetiram...' : 'Resetiraj lozinku'}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
