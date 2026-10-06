'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { changeOwnPassword } from '@/actions/account'
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PROBLEM_MESSAGE,
  passwordProblem,
} from '@/lib/password-policy'

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'

/** Staff change-password form, shared by /admin/lozinka and /nastavnik/lozinka. */
export function ChangePasswordForm({ email }: Readonly<{ email: string }>) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    const problem = passwordProblem(password, confirm, email)
    if (problem) {
      setError(PASSWORD_PROBLEM_MESSAGE[problem])
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await changeOwnPassword({ current, password, confirm })
      if (res.success) {
        setCurrent('')
        setPassword('')
        setConfirm('')
        toast.success('Lozinka je promijenjena. Ostali uređaji odjavit će se u roku od minute.')
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 max-w-sm">
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div>
        <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Trenutna lozinka
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Nova lozinka
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500">Barem {PASSWORD_MIN_LENGTH} znakova.</p>
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Ponovite novu lozinku
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Spremam...' : 'Promijeni lozinku'}
      </button>
    </form>
  )
}
