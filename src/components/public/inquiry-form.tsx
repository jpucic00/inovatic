'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { City } from '@prisma/client'
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

const step1Fields = ['city', 'parentName', 'parentEmail', 'parentPhone'] as const
const step2Fields = ['childFirstName', 'childLastName', 'childDateOfBirth', 'childSchool'] as const

interface InquiryFormProps {
  /**
   * Programs pre-rendered per city. /upisi passes both cities so switching the
   * dropdown filters client-side with no loading state; /radionice passes just
   * the workshop's city. Missing keys resolve to an empty list.
   */
  programsByCity: Partial<Record<City, ActiveProgram[]>>
  preselectedCourseId?: string
  /** Fixed city for the radionica flow — hides the Step-1 city dropdown. */
  preselectedCity?: City
}

export function InquiryForm({
  programsByCity,
  preselectedCourseId,
  preselectedCity,
}: Readonly<InquiryFormProps>) {
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [submittedCount, setSubmittedCount] = useState(0)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Live availability keyed by city — the 30s poll / GROUP_FULL refresh only
  // ever touches the currently-selected city's entry, so a stale count for one
  // city can never leak into the other.
  const [liveByCity, setLiveByCity] = useState<Partial<Record<City, ActiveProgram[]>>>({})

  const {
    register,
    trigger,
    watch,
    handleSubmit,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useForm<InquiryFormData>({
    resolver: zodResolver(inquirySchema),
    mode: 'onTouched',
    defaultValues: {
      ...(preselectedCourseId ? { courseId: preselectedCourseId } : {}),
      ...(preselectedCity ? { city: preselectedCity } : {}),
    },
  })

  const watchedCity = watch('city')
  const selectedCity: City | '' = preselectedCity ?? (watchedCity || '')
  const activePrograms: ActiveProgram[] = selectedCity
    ? (liveByCity[selectedCity] ?? programsByCity[selectedCity] ?? [])
    : []

  // Poll availability for the selected city while on Step 3.
  useEffect(() => {
    if (step !== 3 || !selectedCity) return

    const cityParam = selectedCity
    let cancelled = false
    async function refresh() {
      try {
        const res = await fetch(`/api/group-availability?city=${cityParam}`)
        if (!res.ok) return
        const fresh: ActiveProgram[] = await res.json()
        if (!cancelled) setLiveByCity((m) => ({ ...m, [cityParam]: fresh }))
      } catch { /* stale data is acceptable briefly */ }
    }

    void refresh()
    const interval = setInterval(refresh, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [step, selectedCity])

  // Changing the city invalidates any Step-3 course/group already chosen for
  // the previous city — clear it (keeping the radionica preselect, if any).
  const cityResetRef = useRef<string | undefined>(watchedCity)
  useEffect(() => {
    if (cityResetRef.current === watchedCity) return
    cityResetRef.current = watchedCity
    setValue('scheduledGroupId', undefined)
    setValue('courseId', preselectedCourseId || undefined)
  }, [watchedCity, setValue, preselectedCourseId])

  async function handleNext() {
    let valid = false
    if (step === 1) valid = await trigger(step1Fields as unknown as (keyof InquiryFormData)[])
    if (step === 2) valid = await trigger(step2Fields as unknown as (keyof InquiryFormData)[])
    if (valid) setStep((s) => s + 1)
  }

  function handleBack() {
    setStep((s) => s - 1)
  }

  function onFormSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step < 3) {
      void handleNext()
    } else {
      void handleSubmit(onSubmit)()
    }
  }

  function onSubmit(data: InquiryFormData) {
    setServerError(null)
    startTransition(async () => {
      const result = await submitInquiry(data)
      if (result.success) {
        setSubmittedCount((c) => c + 1)
        setDone(true)
      } else if ('code' in result && result.code === 'GROUP_FULL') {
        setLiveByCity((m) => ({ ...m, [data.city]: result.programs }))
        setServerError(result.error)
      } else {
        setServerError(result.error)
      }
    })
  }

  function handleAnotherChild() {
    reset({
      city: getValues('city'),
      parentName: getValues('parentName'),
      parentEmail: getValues('parentEmail'),
      parentPhone: getValues('parentPhone'),
      ...(preselectedCourseId ? { courseId: preselectedCourseId } : {}),
    })
    setDone(false)
    setStep(2)
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">
          {submittedCount > 1 ? 'Još jedan upit je poslan!' : 'Upit je poslan!'}
        </h2>
        <p className="text-gray-600 max-w-md mx-auto">
          Zahvaljujemo na upitu. Provjerite email — poslali smo potvrdu. Kontaktirat ćemo vas s dostupnim terminima u
          najkraćem mogućem roku.
        </p>
        <button
          type="button"
          onClick={handleAnotherChild}
          className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-cyan-200 text-cyan-600 font-medium text-sm hover:bg-cyan-50 transition"
        >
          Upiši još jedno dijete
        </button>
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

      <form onSubmit={onFormSubmit} noValidate>
        {step === 1 && <InquiryStep1 register={register} errors={errors} showCity={!preselectedCity} />}
        {step === 2 && <InquiryStep2 register={register} errors={errors} setValue={setValue} getValues={getValues} />}
        {step === 3 && (
          <InquiryStep3 register={register} errors={errors} setValue={setValue} getValues={getValues} programs={activePrograms} preselectedCourseId={preselectedCourseId} />
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
