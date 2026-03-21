'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
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
import { createGroupSchema, type CreateGroupInput } from '@/lib/validators/admin/group'
import { createGroup } from '@/actions/admin/group'
import { DAYS_HR } from '@/lib/format'
import { adminInputClass, adminSelectClass } from '@/lib/admin-styles'

type CourseOption = { id: string; title: string; isCustom: boolean }
type LocationOption = { id: string; name: string }

interface CreateGroupDialogProps {
  courses: CourseOption[]
  locations: LocationOption[]
}

export function CreateGroupDialog({ courses, locations }: Readonly<CreateGroupDialogProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { maxStudents: 12 },
  })

  const selectedCourseId = useWatch({ control, name: 'courseId' })
  const isRadionica = courses.find((c) => c.id === selectedCourseId)?.isCustom ?? false

  function onSubmit(data: CreateGroupInput) {
    startTransition(async () => {
      const result = await createGroup(data)
      if (result.success) {
        toast.success('Grupa kreirana.')
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
          Nova grupa
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova grupa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <label htmlFor="create-courseId" className="block text-sm font-medium text-gray-700 mb-1">Program *</label>
            <select id="create-courseId" {...register('courseId')} className={adminSelectClass}>
              <option value="">– Odaberite program –</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            {errors.courseId && <p className="text-xs text-red-600 mt-1">{errors.courseId.message}</p>}
          </div>
          <div>
            <label htmlFor="create-locationId" className="block text-sm font-medium text-gray-700 mb-1">Lokacija *</label>
            <select id="create-locationId" {...register('locationId')} className={adminSelectClass}>
              <option value="">– Odaberite lokaciju –</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {errors.locationId && <p className="text-xs text-red-600 mt-1">{errors.locationId.message}</p>}
          </div>
          <div>
            <label htmlFor="create-name" className="block text-sm font-medium text-gray-700 mb-1">Naziv grupe *</label>
            <input id="create-name" {...register('name')} className={adminInputClass} placeholder="npr. Grupa A, Ujutro" />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              {isRadionica ? (
                <>
                  <label htmlFor="create-date" className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
                  <input id="create-date" {...register('date')} type="date" className={adminInputClass} />
                  {errors.date && <p className="text-xs text-red-600 mt-1">{errors.date.message}</p>}
                </>
              ) : (
                <>
                  <label htmlFor="create-dayOfWeek" className="block text-sm font-medium text-gray-700 mb-1">Dan *</label>
                  <select id="create-dayOfWeek" {...register('dayOfWeek')} className={adminSelectClass}>
                    <option value="">–</option>
                    {DAYS_HR.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {errors.dayOfWeek && <p className="text-xs text-red-600 mt-1">{errors.dayOfWeek.message}</p>}
                </>
              )}
            </div>
            <div>
              <label htmlFor="create-startTime" className="block text-sm font-medium text-gray-700 mb-1">Početak *</label>
              <input id="create-startTime" {...register('startTime')} className={adminInputClass} placeholder="19:00" />
              {errors.startTime && <p className="text-xs text-red-600 mt-1">{errors.startTime.message}</p>}
            </div>
            <div>
              <label htmlFor="create-endTime" className="block text-sm font-medium text-gray-700 mb-1">Kraj *</label>
              <input id="create-endTime" {...register('endTime')} className={adminInputClass} placeholder="20:30" />
              {errors.endTime && <p className="text-xs text-red-600 mt-1">{errors.endTime.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-schoolYear" className="block text-sm font-medium text-gray-700 mb-1">Školska godina</label>
              <input id="create-schoolYear" {...register('schoolYear')} className={adminInputClass} placeholder="2025/2026" />
            </div>
            <div>
              <label htmlFor="create-maxStudents" className="block text-sm font-medium text-gray-700 mb-1">Max polaznika</label>
              <input id="create-maxStudents" {...register('maxStudents')} type="number" min={1} max={50} className={adminInputClass} />
              {errors.maxStudents && <p className="text-xs text-red-600 mt-1">{errors.maxStudents.message}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prozor upisa{' '}
              <span className="text-xs font-normal text-gray-400 ml-1">(ostavite prazno za uvijek otvoreno)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="create-enrollmentStart" className="text-xs text-gray-500 mb-1 block">Od</label>
                <input id="create-enrollmentStart" {...register('enrollmentStart')} type="date" className={adminInputClass} />
              </div>
              <div>
                <label htmlFor="create-enrollmentEnd" className="text-xs text-gray-500 mb-1 block">Do</label>
                <input id="create-enrollmentEnd" {...register('enrollmentEnd')} type="date" className={adminInputClass} />
              </div>
            </div>
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
              {isPending ? 'Kreiram...' : 'Kreiraj grupu'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
