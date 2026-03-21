'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createCourseSchema, type CreateCourseInput } from '@/lib/validators/admin/course'
import { createCourse } from '@/actions/admin/course'

const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

export function CreateCourseDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: { ageMin: 6, ageMax: 14 },
  })

  function onSubmit(data: CreateCourseInput) {
    startTransition(async () => {
      const result = await createCourse(data)
      if (result.success) {
        toast.success('Program kreiran.')
        reset()
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <Plus className="w-4 h-4" />
          Nova radionica
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova radionica</DialogTitle>
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
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Kreiram...' : 'Kreiraj radionicu'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
