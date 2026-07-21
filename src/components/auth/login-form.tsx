'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LayoutDashboard, Loader2, Presentation } from 'lucide-react'
import { loginSchema, type LoginFormData } from '@/lib/validators/login'
import { loginAction } from '@/actions/login'

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
const errorInputClass =
  'w-full px-3 py-2.5 rounded-lg border border-red-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent'

export function LoginForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPanelChoice, setShowPanelChoice] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
  })

  function goTo(destination: string) {
    router.push(destination)
    router.refresh()
  }

  function onSubmit(data: LoginFormData) {
    setServerError(null)
    startTransition(async () => {
      const result = await loginAction(data)
      if (result.success) {
        // A dual-role admin (also assigned as teacher) picks a panel instead
        // of being auto-redirected.
        if (result.role === 'ADMIN' && result.showTeacherPanel) {
          setShowPanelChoice(true)
          return
        }
        let destination = '/portal'
        if (result.role === 'ADMIN') destination = '/admin'
        else if (result.role === 'TEACHER') destination = '/nastavnik'
        goTo(destination)
      } else {
        setServerError(result.error)
      }
    })
  }

  if (showPanelChoice) {
    const choiceClass =
      'w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-cyan-500 hover:text-cyan-600 transition-colors'
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500 text-center">
          Prijava uspješna. Odaberite panel:
        </p>
        <button type="button" onClick={() => goTo('/admin')} className={choiceClass}>
          <LayoutDashboard className="w-4 h-4 text-cyan-500" />
          Administracija
        </button>
        <button type="button" onClick={() => goTo('/nastavnik')} className={choiceClass}>
          <Presentation className="w-4 h-4 text-cyan-500" />
          Nastavnički panel
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1.5">
          Korisničko ime ili e-mail
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          placeholder="korisnickoime ili email@primjer.hr"
          className={errors.identifier ? errorInputClass : inputClass}
          {...register('identifier')}
        />
        {errors.identifier && (
          <p className="mt-1 text-xs text-red-600">{errors.identifier.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Lozinka
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className={errors.password ? errorInputClass : inputClass}
          {...register('password')}
        />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>

      {serverError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm"
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Prijavljivanje...
          </span>
        ) : (
          'Prijavi se'
        )}
      </button>
    </form>
  )
}
