'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Loader2, PartyPopper } from 'lucide-react'
import { partyInquirySchema, type PartyInquiryFormData } from '@/lib/validators/inquiry'
import { submitPartyInquiry } from '@/actions/inquiry'
import { DateInput } from '@/components/ui/date-input'
import { FieldError } from './inquiry/FieldError'

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

export function PartyInquiryForm() {
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PartyInquiryFormData>({
    resolver: zodResolver(partyInquirySchema),
    mode: 'onTouched',
  })

  const proposedDate = watch('partyProposedDate') ?? ''

  function onSubmit(data: PartyInquiryFormData) {
    setServerError(null)
    startTransition(async () => {
      const result = await submitPartyInquiry(data)
      if (result.success) {
        setDone(true)
      } else {
        setServerError(result.error)
      }
    })
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Upit je poslan!</h2>
        <p className="text-gray-600 max-w-md mx-auto">
          Zahvaljujemo na upitu za proslavu. Provjerite email — poslali smo potvrdu.
          Kontaktirat ćemo vas radi dogovora termina u najkraćem mogućem roku.
        </p>
        <button
          type="button"
          onClick={() => {
            reset()
            setDone(false)
          }}
          className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-cyan-200 text-cyan-600 font-medium text-sm hover:bg-cyan-50 transition"
        >
          Pošalji novi upit
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <PartyPopper className="w-5 h-5 text-fuchsia-500" />
        <h2 className="text-xl font-bold text-gray-900">Zatražite ponudu za proslavu</h2>
      </div>
      <p className="text-gray-500 text-sm -mt-3">
        Ispunite obrazac i javit ćemo vam se s dostupnim terminima i detaljima.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="parentFirstName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Ime <span className="text-red-500">*</span>
          </label>
          <input
            id="parentFirstName"
            {...register('parentFirstName')}
            type="text"
            placeholder="npr. Ana"
            className={inputClass}
          />
          <FieldError message={errors.parentFirstName?.message} />
        </div>
        <div>
          <label htmlFor="parentLastName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Prezime <span className="text-red-500">*</span>
          </label>
          <input
            id="parentLastName"
            {...register('parentLastName')}
            type="text"
            placeholder="npr. Horvat"
            className={inputClass}
          />
          <FieldError message={errors.parentLastName?.message} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="parentPhone" className="block text-sm font-medium text-gray-700 mb-1.5">
            Kontakt broj <span className="text-red-500">*</span>
          </label>
          <input
            id="parentPhone"
            {...register('parentPhone')}
            type="tel"
            placeholder="npr. 091 234 5678"
            className={inputClass}
          />
          <FieldError message={errors.parentPhone?.message} />
        </div>
        <div>
          <label htmlFor="parentEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email adresa <span className="text-red-500">*</span>
          </label>
          <input
            id="parentEmail"
            {...register('parentEmail')}
            type="email"
            placeholder="npr. ana.horvat@gmail.com"
            className={inputClass}
          />
          <FieldError message={errors.parentEmail?.message} />
        </div>
      </div>

      <div>
        <label htmlFor="partyProposedDate" className="block text-sm font-medium text-gray-700 mb-1.5">
          Predloženi datum proslave <span className="text-gray-400 font-normal">(neobavezno)</span>
        </label>
        <DateInput
          id="partyProposedDate"
          value={proposedDate}
          onChange={(iso) => setValue('partyProposedDate', iso, { shouldValidate: true })}
          className={inputClass}
        />
        <FieldError message={errors.partyProposedDate?.message} />
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1.5">
          Vaš upit <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          {...register('message')}
          rows={4}
          placeholder="Napišite broj i dob djece, željeni termin i sve što je važno za proslavu."
          className={`${inputClass} resize-none`}
        />
        <FieldError message={errors.message?.message} />
      </div>

      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('consent')}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-sm text-gray-600">
            Suglasan/na sam s{' '}
            <Link href="/politika-privatnosti" target="_blank" className="text-cyan-600 hover:underline">
              politikom privatnosti
            </Link>{' '}
            i obradom osobnih podataka u svrhu obrade upita.
          </span>
        </label>
        <FieldError message={errors.consent?.message} />
      </div>

      {serverError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Šaljem...
          </>
        ) : (
          'Pošalji upit'
        )}
      </button>
    </form>
  )
}
