'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { inquirySchema, step1Schema, step2Schema, step3Schema, type InquiryFormData } from '@/lib/validators/inquiry'
import { submitInquiry } from '@/actions/inquiry'

const STEPS = [
  { id: 1, label: 'Roditelj' },
  { id: 2, label: 'Dijete' },
  { id: 3, label: 'Preferencije' },
]

const step1Fields = ['parentName', 'parentEmail', 'parentPhone'] as const
const step2Fields = ['childName', 'childAge', 'childSchool'] as const
const step3Fields = ['courseLevelPref', 'locationPref', 'message'] as const

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-red-600 mt-1">{message}</p>
}

export function InquiryForm() {
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<InquiryFormData>({
    resolver: zodResolver(inquirySchema),
    mode: 'onTouched',
  })

  async function handleNext() {
    let valid = false
    if (step === 1) valid = await trigger(step1Fields as unknown as (keyof InquiryFormData)[])
    if (step === 2) valid = await trigger(step2Fields as unknown as (keyof InquiryFormData)[])
    if (valid) setStep((s) => s + 1)
  }

  function handleBack() {
    setStep((s) => s - 1)
  }

  function onSubmit(data: InquiryFormData) {
    setServerError(null)
    startTransition(async () => {
      const result = await submitInquiry(data)
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
          Zahvaljujemo na upitu. Provjerite email — poslali smo potvrdu. Kontaktirat ćemo vas s dostupnim terminima u
          najkraćem mogućem roku.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                step > s.id
                  ? 'bg-cyan-500 text-white'
                  : step === s.id
                  ? 'bg-cyan-500 text-white ring-4 ring-cyan-100'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s.id ? <CheckCircle className="w-4 h-4" /> : s.id}
            </div>
            <span
              className={`text-sm font-medium hidden sm:block ${
                step >= s.id ? 'text-gray-700' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Step 1 – Parent info */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Podaci o roditelju / skrbniku</h2>
              <p className="text-gray-500 text-sm">Na ovu adresu ćemo vam poslati dostupne termine.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Ime i prezime <span className="text-red-500">*</span>
              </label>
              <input
                {...register('parentName')}
                type="text"
                placeholder="npr. Ana Horvat"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
              <FieldError message={errors.parentName?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email adresa <span className="text-red-500">*</span>
              </label>
              <input
                {...register('parentEmail')}
                type="email"
                placeholder="npr. ana.horvat@gmail.com"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
              <FieldError message={errors.parentEmail?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Broj telefona <span className="text-red-500">*</span>
              </label>
              <input
                {...register('parentPhone')}
                type="tel"
                placeholder="npr. 091 234 5678"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
              <FieldError message={errors.parentPhone?.message} />
            </div>
          </div>
        )}

        {/* Step 2 – Child info */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Podaci o djetetu</h2>
              <p className="text-gray-500 text-sm">Na temelju dobi preporučit ćemo odgovarajući razred programa.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Ime djeteta <span className="text-red-500">*</span>
              </label>
              <input
                {...register('childName')}
                type="text"
                placeholder="npr. Luka"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
              <FieldError message={errors.childName?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Dob djeteta <span className="text-red-500">*</span>
              </label>
              <input
                {...register('childAge')}
                type="number"
                min={5}
                max={16}
                placeholder="npr. 9"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
              <FieldError message={errors.childAge?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Škola <span className="text-gray-400 font-normal">(neobavezno)</span>
              </label>
              <input
                {...register('childSchool')}
                type="text"
                placeholder="npr. OŠ Trstenik"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
            </div>
          </div>
        )}

        {/* Step 3 – Preferences + message */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Preferencije</h2>
              <p className="text-gray-500 text-sm">Svi unosi su neobavezni – pomažu nam u dodjeli odgovarajuće grupe.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Program</label>
              <select
                {...register('courseLevelPref')}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              >
                <option value="">– Odaberite program (neobavezno) –</option>
                <option value="SLR_1">SLR 1 – Uvod u robotiku (6–8 god.)</option>
                <option value="SLR_2">SLR 2 – Napredna mehanika (9–10 god.)</option>
                <option value="SLR_3">SLR 3 – Spike Prime (11–12 god.)</option>
                <option value="SLR_4">SLR 4 – Industrijski sustavi (13–14 god.)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferencija lokacije</label>
              <select
                {...register('locationPref')}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              >
                <option value="">– Odaberite lokaciju (neobavezno) –</option>
                <option value="Velebitska 32">Velebitska 32, Split</option>
                <option value="Ruđera Boškovića 33">Ruđera Boškovića 33, Split</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Poruka</label>
              <textarea
                {...register('message')}
                rows={4}
                placeholder="Imate li pitanja ili posebnih napomena?"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition resize-none"
              />
              <FieldError message={errors.message?.message} />
            </div>
          </div>
        )}

        {serverError && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {serverError}
          </p>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition font-medium text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Nazad
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-600 transition text-sm shadow-sm"
            >
              Dalje <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-600 disabled:opacity-60 disabled:cursor-not-allowed transition text-sm shadow-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Šaljem...
                </>
              ) : (
                'Pošalji upit'
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
