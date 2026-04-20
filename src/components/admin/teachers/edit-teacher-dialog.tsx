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
import { Pencil } from 'lucide-react'
import { updateTeacher } from '@/actions/admin/teacher'
import { toast } from 'sonner'

interface Props {
  teacher: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
  }
}

export function EditTeacherDialog({ teacher }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState(teacher.firstName)
  const [lastName, setLastName] = useState(teacher.lastName)
  const [phone, setPhone] = useState(teacher.phone ?? '')
  const [isPending, startTransition] = useTransition()

  const canSubmit =
    firstName.trim().length >= 2 && lastName.trim().length >= 2

  const handleSubmit = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await updateTeacher({
        id: teacher.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
      })
      if (res.success) {
        toast.success('Spremljeno.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
          Uredi
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Uredi nastavnika</DialogTitle>
          <DialogDescription>
            E-mail se ne može mijenjati. Za promjenu e-maila obrišite račun i
            kreirajte novi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-teacher-first"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Ime *
              </label>
              <input
                id="edit-teacher-first"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label
                htmlFor="edit-teacher-last"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Prezime *
              </label>
              <input
                id="edit-teacher-last"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="edit-teacher-phone"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Telefon
            </label>
            <input
              id="edit-teacher-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending || !canSubmit}
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
