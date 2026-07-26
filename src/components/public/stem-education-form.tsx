'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Loader2 } from 'lucide-react'
import {
  INSTITUTION_TYPE_LABELS,
  INSTITUTION_TYPE_VALUES,
  SERVICE_LABELS,
  SERVICE_VALUES,
  TRAINING_PLACE_LABELS,
  TRAINING_PLACE_VALUES,
  stemEducationInquirySchema,
  type StemEducationInquiryFormData,
} from '@/lib/validators/stem-education'
import { submitStemEducationInquiry } from '@/actions/stem-education'
import { trackUmamiEvent } from '@/lib/umami'
import { FieldError } from './inquiry/FieldError'

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

export function StemEducationForm() {
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StemEducationInquiryFormData>({
    resolver: zodResolver(stemEducationInquirySchema),
    mode: 'onTouched',
    defaultValues: { services: [] },
  })

  function onSubmit(data: StemEducationInquiryFormData) {
    setServerError(null)
    startTransition(async () => {
      const result = await submitStemEducationInquiry(data)
      if (result.success) {
        trackUmamiEvent('stem-education-inquiry')
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
          Zahvaljujemo na upitu. Provjerite email — poslali smo potvrdu. Javit ćemo vam se s
          prijedlogom programa i ponudom prilagođenom vašoj ustanovi.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="contactName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Ime i prezime <span className="text-red-500">*</span>
          </label>
          <input
            id="contactName"
            {...register('contactName')}
            type="text"
            placeholder="npr. Ivana Ivić"
            className={inputClass}
          />
          <FieldError message={errors.contactName?.message} />
        </div>
        <div>
          <label htmlFor="institutionName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Naziv ustanove <span className="text-red-500">*</span>
          </label>
          <input
            id="institutionName"
            {...register('institutionName')}
            type="text"
            placeholder="npr. OŠ Meje"
            className={inputClass}
          />
          <FieldError message={errors.institutionName?.message} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Email adresa <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            {...register('email')}
            type="email"
            placeholder="npr. ivana.ivic@skole.hr"
            className={inputClass}
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
            Telefon <span className="text-gray-400 font-normal">(neobavezno)</span>
          </label>
          <input
            id="phone"
            {...register('phone')}
            type="tel"
            placeholder="npr. 091 234 5678"
            className={inputClass}
          />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>

      <div>
        <label htmlFor="institutionType" className="block text-sm font-medium text-gray-700 mb-1.5">
          Vrsta ustanove <span className="text-red-500">*</span>
        </label>
        <select id="institutionType" {...register('institutionType')} defaultValue="" className={inputClass}>
          <option value="" disabled>
            — Odaberite vrstu ustanove —
          </option>
          {INSTITUTION_TYPE_VALUES.map((value) => (
            <option key={value} value={value}>
              {INSTITUTION_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
        <FieldError message={errors.institutionType?.message} />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1.5">
          Koja vam je usluga potrebna? <span className="text-red-500">*</span>
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
          {SERVICE_VALUES.map((value) => (
            <label key={value} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                value={value}
                {...register('services')}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-sm text-gray-600">{SERVICE_LABELS[value]}</span>
            </label>
          ))}
        </div>
        <FieldError message={errors.services?.message} />
      </fieldset>

      <div>
        <label htmlFor="trainingPlace" className="block text-sm font-medium text-gray-700 mb-1.5">
          Željeno mjesto održavanja <span className="text-gray-400 font-normal">(neobavezno)</span>
        </label>
        <select id="trainingPlace" {...register('trainingPlace')} defaultValue="" className={inputClass}>
          <option value="">— Odaberite mjesto održavanja —</option>
          {TRAINING_PLACE_VALUES.map((value) => (
            <option key={value} value={value}>
              {TRAINING_PLACE_LABELS[value]}
            </option>
          ))}
        </select>
        <FieldError message={errors.trainingPlace?.message} />
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1.5">
          Opišite svoje potrebe <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          {...register('message')}
          rows={5}
          placeholder="Koju opremu imate ili planirate nabaviti, koliko mentora treba educirati, za koji uzrast učenika i u kojem roku."
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
