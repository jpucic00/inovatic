'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { UserPlus, Copy, ExternalLink, CheckCircle2 } from 'lucide-react'
import { createTeacher } from '@/actions/admin/teacher'
import { toast } from 'sonner'

export function CreateTeacherDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    teacherId: string
    password: string
    emailSent: boolean
  } | null>(null)

  const canSubmit =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2

  const reset = () => {
    setEmail('')
    setFirstName('')
    setLastName('')
    setPhone('')
    setResult(null)
  }

  const handleSubmit = () => {
    if (!canSubmit) {
      toast.error('Provjerite unesene podatke.')
      return
    }
    startTransition(async () => {
      const res = await createTeacher({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
      })
      if (res.success) {
        setResult(res)
        toast.success('Nastavnik kreiran.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const copyCredentials = () => {
    if (!result) return
    const text = `E-mail: ${email}\nLozinka: ${result.password}`
    navigator.clipboard.writeText(text)
    toast.success('Podaci kopirani.')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <UserPlus className="w-4 h-4" />
          Kreiraj nastavnika
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {result ? 'Nastavnik kreiran' : 'Kreiraj nastavnika'}
          </DialogTitle>
          <DialogDescription>
            {result
              ? result.emailSent
                ? 'Pristupni podaci poslani su na unesenu e-mail adresu.'
                : 'Račun je kreiran. E-mail nije poslan — podijelite pristupne podatke ručno.'
              : 'Kreiranjem računa generira se privremena lozinka koja se šalje na e-mail.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            {result.emailSent && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-800">
                  E-mail s pristupnim podacima poslan je na <strong>{email}</strong>.
                </p>
              </div>
            )}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-medium text-green-800 mb-2">
                Pristupni podaci
              </p>
              <div className="font-mono text-sm text-gray-800 space-y-1">
                <p>
                  <span className="text-gray-500">E-mail:</span> {email}
                </p>
                <p>
                  <span className="text-gray-500">Lozinka:</span>{' '}
                  {result.password}
                </p>
              </div>
              <button
                onClick={copyCredentials}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Kopiraj podatke
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Link
                href={`/admin/nastavnici/${result.teacherId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Profil nastavnika
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Zatvori
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="teacher-email"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                E-mail *
              </label>
              <input
                id="teacher-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="teacher-first"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Ime *
                </label>
                <input
                  id="teacher-first"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <div>
                <label
                  htmlFor="teacher-last"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Prezime *
                </label>
                <input
                  id="teacher-last"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="teacher-phone"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Telefon
              </label>
              <input
                id="teacher-phone"
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
                {isPending ? 'Kreiram...' : 'Kreiraj nastavnika'}
              </button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
