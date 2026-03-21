'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { inquirySchema, type InquiryFormData } from '@/lib/validators/inquiry'
import { submitInquiry } from '@/actions/inquiry'
import type { ActiveProgram } from '@/actions/public/programs'
import { InquiryStep1 } from './inquiry/InquiryStep1'
import { InquiryStep2 } from './inquiry/InquiryStep2'
import { InquiryStep3 } from './inquiry/InquiryStep3'

function getStepClass(currentStep: number, stepId: number): string {
  if (currentStep > stepId) return 'bg-cyan-500 text-white'
  if (currentStep === stepId) return 'bg-cyan-500 text-white ring-4 ring-cyan-100'
  return 'bg-gray-100 text-gray-400'
}

const STEPS = [
  { id: 1, label: 'Roditelj' },
  { id: 2, label: 'Dijete' },
  { id: 3, label: 'Dostupni termini' },
]

const step1Fields = ['parentName', 'parentEmail', 'parentPhone'] as const
const step2Fields = ['childFirstName', 'childLastName', 'childDateOfBirth', 'childSchool'] as const

interface InquiryFormProps {
  programs: ActiveProgram[]
  preselectedCourseId?: string
}

export function InquiryForm({ programs, preselectedCourseId }: Readonly<InquiryFormProps>) {
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    trigger,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<InquiryFormData>({
    resolver: zodResolver(inquirySchema),
    mode: 'onTouched',
    defaultValues: preselectedCourseId ? { courseId: preselectedCourseId, grade: 'workshop' } : undefined,
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
                getStepClass(step, s.id)
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
        {step === 1 && <InquiryStep1 register={register} errors={errors} />}
        {step === 2 && <InquiryStep2 register={register} errors={errors} setValue={setValue} />}
        {step === 3 && (
          <InquiryStep3 register={register} errors={errors} setValue={setValue} programs={programs} preselectedCourseId={preselectedCourseId} />
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
