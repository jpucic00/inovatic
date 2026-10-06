'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import {
  inspectPasswordLink,
  setPasswordWithLink,
  type PasswordLinkView,
} from '@/actions/password-setup'
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PROBLEM_MESSAGE,
  passwordProblem,
} from '@/lib/password-policy'

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'

type State =
  | { step: 'loading' }
  | { step: 'invalid'; error: string }
  | { step: 'form'; token: string; view: Extract<PasswordLinkView, { ok: true }> }
  | { step: 'done'; email: string }

/**
 * Reads the token from the URL fragment, then immediately drops it from the
 * address bar (and so from history and any screenshot of the page), keeping it
 * only in memory for the one submit.
 */
export function SetPasswordForm() {
  const [state, setState] = useState<State>({ step: 'loading' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Read once and kept here: the effect strips the fragment, and React's
  // development double-run would otherwise find it already gone.
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    const inspect = (token: string) =>
      inspectPasswordLink(token)
        .then((view) =>
          setState(view.ok ? { step: 'form', token, view } : { step: 'invalid', error: view.error }),
        )
        .catch(() => setState({ step: 'invalid', error: 'Nešto nije u redu. Pokušajte ponovno.' }))

    tokenRef.current ??= globalThis.location.hash.slice(1)
    const token = tokenRef.current
    globalThis.history.replaceState(null, '', globalThis.location.pathname)
    if (token) inspect(token)
    else setState({ step: 'invalid', error: 'Poveznica nije ispravna. Otvorite je cijelu iz e-maila.' })

    // A second link opened in this tab changes only the fragment, which is not
    // a page load: without this the page keeps answering for the first link.
    const onHashChange = () => {
      const next = globalThis.location.hash.slice(1)
      if (!next) return
      tokenRef.current = next
      globalThis.history.replaceState(null, '', globalThis.location.pathname)
      setPassword('')
      setConfirm('')
      setError(null)
      setState({ step: 'loading' })
      inspect(next)
    }
    globalThis.addEventListener('hashchange', onHashChange)
    return () => globalThis.removeEventListener('hashchange', onHashChange)
  }, [])

  if (state.step === 'loading') {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Provjeravam poveznicu...
      </p>
    )
  }

  if (state.step === 'invalid') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-red-700">{state.error}</p>
        <Link href="/portal" className="text-sm text-cyan-600 hover:underline">
          Na prijavu
        </Link>
      </div>
    )
  }

  if (state.step === 'done') {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto w-10 h-10 text-emerald-500" />
        <p className="text-sm text-gray-700">
          Lozinka je postavljena. Prijavite se e-mailom <strong>{state.email}</strong> i novom
          lozinkom.
        </p>
        <Link
          href="/portal"
          className="inline-block w-full py-2.5 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-600 transition-colors text-sm"
        >
          Prijava
        </Link>
      </div>
    )
  }

  const { token, view } = state

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault()
    const problem = passwordProblem(password, confirm, view.email)
    if (problem) {
      setError(PASSWORD_PROBLEM_MESSAGE[problem])
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await setPasswordWithLink({ token, password, confirm })
      if (res.ok) setState({ step: 'done', email: res.email })
      else setError(res.error)
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="text-sm text-gray-700 space-y-1">
        <p>
          Prijava: <strong>{view.email}</strong>
        </p>
        {view.children.length > 0 && (
          <p className="text-gray-500">Na računu: {view.children.join(', ')}</p>
        )}
      </div>

      {/* The address is the username: giving the browser both fields lets a
          password manager store this login correctly. */}
      <input type="email" name="username" value={view.email} autoComplete="username" readOnly hidden />

      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Nova lozinka
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Sakrij lozinku' : 'Prikaži lozinku'}
            className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600"
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Barem {PASSWORD_MIN_LENGTH} znakova. Duža rečenica koju lako pamtite bolja je od kratke
          lozinke sa simbolima.
        </p>
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Ponovite lozinku
        </label>
        <input
          id="confirm-password"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm"
      >
        {isPending ? 'Spremam...' : 'Postavi lozinku'}
      </button>
    </form>
  )
}
