'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Plus } from 'lucide-react'
import type { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createCourseSchema, type CreateCourseInput } from '@/lib/validators/admin/course'
import { createCourse, updateCourse } from '@/actions/admin/course'
import { adminInputClass as inputClass } from '@/lib/admin-styles'

type EditableCourse = {
  id: string
  title: string
  description: string
  ageMin: number
  ageMax: number
  price: number | null
}

// z.input, not the parsed output: the number inputs hand back strings and the
// price preprocess widens its own input, so this is what the form holds.
type FormValues = z.input<typeof createCourseSchema>

interface Props {
  /** Omit for a new radionica; pass a row to edit that one. */
  course?: EditableCourse
  /** Pill-sized trigger, for rows whose other actions are pills. */
  compact?: boolean
}

function defaultsFor(course?: EditableCourse): FormValues {
  return {
    title: course?.title ?? '',
    description: course?.description ?? '',
    ageMin: course?.ageMin ?? 6,
    ageMax: course?.ageMax ?? 14,
    // '' rather than undefined so clearing the field round-trips as "no price".
    price: course?.price ?? '',
  }
}

/**
 * One form for both radionica create and edit — same fields, same validation.
 * Standard SLR programs are not editable here (the server action refuses them);
 * only radionice ever get this dialog.
 */
export function CourseFormDialog({ course, compact = false }: Readonly<Props>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const isEdit = course != null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: defaultsFor(course),
  })

  // Reopening starts from the saved row again, so abandoned edits never linger.
  function handleOpenChange(next: boolean) {
    if (next) reset(defaultsFor(course))
    setOpen(next)
  }

  function onSubmit(data: CreateCourseInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateCourse({ ...data, id: course.id })
        : await createCourse(data)

      if (result.success) {
        toast.success(isEdit ? 'Spremljeno.' : 'Program kreiran.')
        if (!isEdit) reset(defaultsFor())
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button
            title="Uredi radionicu"
            className={
              compact
                ? 'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors'
                : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors'
            }
          >
            <Pencil className="w-3.5 h-3.5" />
            Uredi
          </button>
        ) : (
          <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
            <Plus className="w-4 h-4" />
            Nova radionica
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Uredi radionicu' : 'Nova radionica'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <label htmlFor="course-title" className="block text-sm font-medium text-gray-700 mb-1">Naziv *</label>
            <input id="course-title" {...register('title')} className={inputClass} placeholder="npr. Ljetne radionice 2026" />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label htmlFor="course-description" className="block text-sm font-medium text-gray-700 mb-1">Opis *</label>
            <textarea
              id="course-description"
              {...register('description')}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Kratki opis radionice..."
            />
            {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="course-ageMin" className="block text-sm font-medium text-gray-700 mb-1">Dob od *</label>
              <input id="course-ageMin" {...register('ageMin')} type="number" className={inputClass} />
              {errors.ageMin && <p className="text-xs text-red-600 mt-1">{errors.ageMin.message}</p>}
            </div>
            <div>
              <label htmlFor="course-ageMax" className="block text-sm font-medium text-gray-700 mb-1">Dob do *</label>
              <input id="course-ageMax" {...register('ageMax')} type="number" className={inputClass} />
              {errors.ageMax && <p className="text-xs text-red-600 mt-1">{errors.ageMax.message}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="course-price" className="block text-sm font-medium text-gray-700 mb-1">Cijena radionice (€)</label>
            <input id="course-price" {...register('price')} type="number" step="0.01" className={inputClass} placeholder="npr. 80" />
            {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price.message}</p>}
          </div>
          {isEdit && (
            <p className="text-xs text-gray-400">
              Javna poveznica radionice ostaje ista i nakon promjene naziva.
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isEdit ? (isPending ? 'Spremam...' : 'Spremi') : (isPending ? 'Kreiram...' : 'Kreiraj radionicu')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
