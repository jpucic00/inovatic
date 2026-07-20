'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Copy } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { resetStudentPassword } from '@/actions/admin/student'
import { toast } from 'sonner'

interface Props {
  studentId: string
  /** Shown in the copy payload so the admin hands over both halves at once. */
  username: string | null
  /** No stored password yet — an imported account that can't be logged into. */
  hasPassword: boolean
}

export function ResetPasswordButton({
  studentId,
  username,
  hasPassword,
}: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [password, setPassword] = useState<string | null>(null)

  const actionLabel = hasPassword ? 'Resetiraj lozinku' : 'Generiraj lozinku'

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await resetStudentPassword(studentId)
      if (res.success) {
        setPassword(res.password)
        toast.success('Nova lozinka postavljena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleClose = () => {
    setOpen(false)
    setPassword(null)
  }

  const copyCredentials = async () => {
    if (!password) return
    const text = username
      ? `Korisničko ime: ${username}\nLozinka: ${password}`
      : `Lozinka: ${password}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Podaci kopirani.')
    } catch {
      toast.error('Kopiranje nije uspjelo.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(o) : handleClose())}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
          <KeyRound className="w-3.5 h-3.5" />
          {actionLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{password ? 'Nova lozinka' : actionLabel}</DialogTitle>
          <DialogDescription>
            {(() => {
              if (password)
                return 'Zapišite ili kopirajte lozinku i predajte je učeniku — e-mail se ne šalje.'
              return hasPassword
                ? 'Ovo će generirati novu lozinku. Postojeća lozinka prestaje vrijediti.'
                : 'Ovaj račun još nema lozinku. Ovo će generirati prvu i omogućiti prijavu.'
            })()}
          </DialogDescription>
        </DialogHeader>

        {password ? (
          <div className="space-y-4 py-2">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              {username && (
                <>
                  <p className="text-sm font-medium text-green-800 mb-1">
                    Korisničko ime
                  </p>
                  <p className="font-mono text-sm text-gray-800 mb-3">{username}</p>
                </>
              )}
              <p className="text-sm font-medium text-green-800 mb-1">Lozinka</p>
              <p className="font-mono text-sm text-gray-800">{password}</p>
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
              {isPending ? 'Generiram...' : actionLabel}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
