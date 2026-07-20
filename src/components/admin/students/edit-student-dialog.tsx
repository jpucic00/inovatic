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
import { DateInput } from '@/components/ui/date-input'
import { updateStudent } from '@/actions/admin/student'
import { toast } from 'sonner'

interface Props {
  student: {
    id: string
    firstName: string
    lastName: string
    dateOfBirth: string | null
    childSchool: string | null
    parentName: string | null
    parentEmail: string | null
    parentPhone: string | null
  }
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

export function EditStudentDialog({ student }: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState(student.firstName)
  const [lastName, setLastName] = useState(student.lastName)
  const [dateOfBirth, setDateOfBirth] = useState(student.dateOfBirth ?? '')
  const [childSchool, setChildSchool] = useState(student.childSchool ?? '')
  const [parentName, setParentName] = useState(student.parentName ?? '')
  const [parentEmail, setParentEmail] = useState(student.parentEmail ?? '')
  const [parentPhone, setParentPhone] = useState(student.parentPhone ?? '')
  const [isPending, startTransition] = useTransition()

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    dateOfBirth.trim().length > 0

  // Reset the form to the persisted values whenever the dialog (re)opens, so a
  // cancelled edit doesn't leak into the next open.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setFirstName(student.firstName)
      setLastName(student.lastName)
      setDateOfBirth(student.dateOfBirth ?? '')
      setChildSchool(student.childSchool ?? '')
      setParentName(student.parentName ?? '')
      setParentEmail(student.parentEmail ?? '')
      setParentPhone(student.parentPhone ?? '')
    }
    setOpen(next)
  }

  const handleSubmit = () => {
    if (!canSubmit) {
      toast.error('Ime, prezime i datum rođenja djeteta su obavezni.')
      return
    }
    startTransition(async () => {
      const res = await updateStudent({
        id: student.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth.trim(),
        childSchool: childSchool.trim() || null,
        parentName: parentName.trim() || null,
        parentEmail: parentEmail.trim() || null,
        parentPhone: parentPhone.trim() || null,
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
          Uredi
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Uredi podatke učenika</DialogTitle>
          <DialogDescription>
            Uredite podatke djeteta i kontakt roditelja. Pristupni podaci i upisi
            se uređuju zasebno.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Child fields */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Dijete
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-student-first" className={labelClass}>
                  Ime *
                </label>
                <input
                  id="edit-student-first"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="edit-student-last" className={labelClass}>
                  Prezime *
                </label>
                <input
                  id="edit-student-last"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="edit-student-dob" className={labelClass}>
                  Datum rođenja *
                </label>
                <DateInput
                  id="edit-student-dob"
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="edit-student-school" className={labelClass}>
                  Škola
                </label>
                <input
                  id="edit-student-school"
                  type="text"
                  value={childSchool}
                  onChange={(e) => setChildSchool(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Parent fields */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Roditelj
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label htmlFor="edit-student-parent-name" className={labelClass}>
                  Ime i prezime
                </label>
                <input
                  id="edit-student-parent-name"
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="edit-student-parent-email" className={labelClass}>
                  E-mail
                </label>
                <input
                  id="edit-student-parent-email"
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="edit-student-parent-phone" className={labelClass}>
                  Telefon
                </label>
                <input
                  id="edit-student-parent-phone"
                  type="tel"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
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
