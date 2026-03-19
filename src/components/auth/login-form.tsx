'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { loginSchema, type LoginFormData } from '@/lib/validators/login'
import { loginAction } from '@/actions/login'

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
const errorInputClass =
  'w-full px-3 py-2.5 rounded-lg border border-red-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent'

export function LoginForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
  })

  function onSubmit(data: LoginFormData) {
    setServerError(null)
    startTransition(async () => {
      const result = await loginAction(data)
      if (result.success) {
        router.push('/admin')
        router.refresh()
      } else {
        setServerError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
          E-mail adresa
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="ime@primjer.hr"
          className={errors.email ? errorInputClass : inputClass}
          {...register('email')}
        />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
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
