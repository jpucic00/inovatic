'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch, Controller } from 'react-hook-form'
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
import { DateInput } from '@/components/ui/date-input'
import {
  TeacherMultiSelect,
  type TeacherOption,
} from '@/components/admin/teachers/teacher-multi-select'

type CourseOption = { id: string; title: string; isCustom: boolean }
type LocationOption = { id: string; name: string }

interface CreateGroupDialogProps {
  courses: CourseOption[]
  locations: LocationOption[]
  currentYear: string
  teachers: TeacherOption[]
}

export function CreateGroupDialog({ courses, locations, currentYear, teachers }: Readonly<CreateGroupDialogProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [teacherIds, setTeacherIds] = useState<string[]>([])
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
      const result = await createGroup({ ...data, teacherIds })
      if (result.success) {
        toast.success('Grupa kreirana.')
        reset()
        setTeacherIds([])
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
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
            Grupa se kreira za školsku godinu{' '}
            <strong className="text-gray-700">{currentYear}</strong>.
          </p>
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
          {isRadionica ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-dateStart" className="block text-sm font-medium text-gray-700 mb-1">Početak radionice *</label>
                  <Controller name="dateStart" control={control} render={({ field }) => <DateInput id="create-dateStart" value={field.value ?? ''} onChange={field.onChange} className={adminInputClass} />} />
                  {errors.dateStart && <p className="text-xs text-red-600 mt-1">{errors.dateStart.message}</p>}
                </div>
                <div>
                  <label htmlFor="create-dateEnd" className="block text-sm font-medium text-gray-700 mb-1">Kraj radionice *</label>
                  <Controller name="dateEnd" control={control} render={({ field }) => <DateInput id="create-dateEnd" value={field.value ?? ''} onChange={field.onChange} className={adminInputClass} />} />
                  {errors.dateEnd && <p className="text-xs text-red-600 mt-1">{errors.dateEnd.message}</p>}
                </div>
              </div>
              <p className="text-xs text-gray-500">Radionica se održava svaki dan u rasponu u istom terminu.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-startTime" className="block text-sm font-medium text-gray-700 mb-1">Vrijeme početka *</label>
                  <input id="create-startTime" {...register('startTime')} className={adminInputClass} placeholder="19:00" />
                  {errors.startTime && <p className="text-xs text-red-600 mt-1">{errors.startTime.message}</p>}
                </div>
                <div>
                  <label htmlFor="create-endTime" className="block text-sm font-medium text-gray-700 mb-1">Vrijeme kraja *</label>
                  <input id="create-endTime" {...register('endTime')} className={adminInputClass} placeholder="20:30" />
                  {errors.endTime && <p className="text-xs text-red-600 mt-1">{errors.endTime.message}</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="create-dayOfWeek" className="block text-sm font-medium text-gray-700 mb-1">Dan *</label>
                <select id="create-dayOfWeek" {...register('dayOfWeek')} className={adminSelectClass}>
                  <option value="">–</option>
                  {DAYS_HR.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {errors.dayOfWeek && <p className="text-xs text-red-600 mt-1">{errors.dayOfWeek.message}</p>}
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
          )}
          <div>
            <label htmlFor="create-maxStudents" className="block text-sm font-medium text-gray-700 mb-1">Max polaznika</label>
            <input id="create-maxStudents" {...register('maxStudents')} type="number" min={1} max={50} className={adminInputClass} />
            {errors.maxStudents && <p className="text-xs text-red-600 mt-1">{errors.maxStudents.message}</p>}
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
            Prozor upisa postavlja se na stranici programa i vrijedi za sve grupe tog programa.
          </p>
          <TeacherMultiSelect
            teachers={teachers}
            selectedIds={teacherIds}
            onChange={setTeacherIds}
            idPrefix="create-group-teacher"
          />
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
