'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createGroupSchema, type CreateGroupInput } from '@/lib/validators/admin/group'
import { updateGroup } from '@/actions/admin/group'
import { DAYS_HR } from '@/lib/format'
import { adminInputClass, adminSelectClass } from '@/lib/admin-styles'
import {
  TeacherMultiSelect,
  type TeacherOption,
} from '@/components/admin/teachers/teacher-multi-select'

type CourseOption = { id: string; title: string; isCustom: boolean }
type LocationOption = { id: string; name: string }

export type GroupForEdit = {
  id: string
  courseId: string
  locationId: string
  name: string | null
  date: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  maxStudents: number
  enrollmentStart: Date | null
  enrollmentEnd: Date | null
  teacherIds: string[]
}

interface EditGroupDialogProps {
  group: GroupForEdit
  courses: CourseOption[]
  locations: LocationOption[]
  teachers: TeacherOption[]
}

function toDateInput(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

export function EditGroupDialog({ group, courses, locations, teachers }: Readonly<EditGroupDialogProps>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [teacherIds, setTeacherIds] = useState<string[]>(group.teacherIds)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      courseId: group.courseId,
      locationId: group.locationId,
      name: group.name ?? '',
      date: group.date ?? '',
      dayOfWeek: group.dayOfWeek ?? '',
      startTime: group.startTime ?? '',
      endTime: group.endTime ?? '',
      schoolYear: group.schoolYear,
      maxStudents: group.maxStudents,
      enrollmentStart: toDateInput(group.enrollmentStart),
      enrollmentEnd: toDateInput(group.enrollmentEnd),
    },
  })

  const selectedCourseId = useWatch({ control, name: 'courseId' })
  const isRadionica = courses.find((c) => c.id === selectedCourseId)?.isCustom ?? false

  function onSubmit(data: CreateGroupInput) {
    startTransition(async () => {
      const result = await updateGroup({ id: group.id, ...data, teacherIds })
      if (result.success) {
        toast.success('Grupa ažurirana.')
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
        <button
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          title="Uredi grupu"
        >
          <Pencil className="w-3.5 h-3.5" />
          Uredi
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Uredi grupu</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <label htmlFor="edit-courseId" className="block text-sm font-medium text-gray-700 mb-1">Program *</label>
            <select id="edit-courseId" {...register('courseId')} className={adminSelectClass}>
              <option value="">– Odaberite program –</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            {errors.courseId && <p className="text-xs text-red-600 mt-1">{errors.courseId.message}</p>}
          </div>
          <div>
            <label htmlFor="edit-locationId" className="block text-sm font-medium text-gray-700 mb-1">Lokacija *</label>
            <select id="edit-locationId" {...register('locationId')} className={adminSelectClass}>
              <option value="">– Odaberite lokaciju –</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {errors.locationId && <p className="text-xs text-red-600 mt-1">{errors.locationId.message}</p>}
          </div>
          <div>
            <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">Naziv grupe *</label>
            <input id="edit-name" {...register('name')} className={adminInputClass} placeholder="npr. Grupa A, Ujutro" />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              {isRadionica ? (
                <>
                  <label htmlFor="edit-date" className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
                  <input id="edit-date" {...register('date')} type="date" className={adminInputClass} />
                  {errors.date && <p className="text-xs text-red-600 mt-1">{errors.date.message}</p>}
                </>
              ) : (
                <>
                  <label htmlFor="edit-dayOfWeek" className="block text-sm font-medium text-gray-700 mb-1">Dan *</label>
                  <select id="edit-dayOfWeek" {...register('dayOfWeek')} className={adminSelectClass}>
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
              <label htmlFor="edit-startTime" className="block text-sm font-medium text-gray-700 mb-1">Početak *</label>
              <input id="edit-startTime" {...register('startTime')} className={adminInputClass} placeholder="19:00" />
              {errors.startTime && <p className="text-xs text-red-600 mt-1">{errors.startTime.message}</p>}
            </div>
            <div>
              <label htmlFor="edit-endTime" className="block text-sm font-medium text-gray-700 mb-1">Kraj *</label>
              <input id="edit-endTime" {...register('endTime')} className={adminInputClass} placeholder="20:30" />
              {errors.endTime && <p className="text-xs text-red-600 mt-1">{errors.endTime.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-schoolYear" className="block text-sm font-medium text-gray-700 mb-1">Školska godina *</label>
              <input id="edit-schoolYear" {...register('schoolYear')} className={adminInputClass} placeholder="2025/2026" />
              {errors.schoolYear && <p className="text-xs text-red-600 mt-1">{errors.schoolYear.message}</p>}
            </div>
            <div>
              <label htmlFor="edit-maxStudents" className="block text-sm font-medium text-gray-700 mb-1">Max polaznika</label>
              <input id="edit-maxStudents" {...register('maxStudents')} type="number" min={1} max={50} className={adminInputClass} />
              {errors.maxStudents && <p className="text-xs text-red-600 mt-1">{errors.maxStudents.message}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prozor upisa</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-enrollmentStart" className="text-xs text-gray-500 mb-1 block">Od</label>
                <input id="edit-enrollmentStart" {...register('enrollmentStart')} type="date" className={adminInputClass} />
                {errors.enrollmentStart && <p className="text-xs text-red-600 mt-1">{errors.enrollmentStart.message}</p>}
              </div>
              <div>
                <label htmlFor="edit-enrollmentEnd" className="text-xs text-gray-500 mb-1 block">Do</label>
                <input id="edit-enrollmentEnd" {...register('enrollmentEnd')} type="date" className={adminInputClass} />
                {errors.enrollmentEnd && <p className="text-xs text-red-600 mt-1">{errors.enrollmentEnd.message}</p>}
              </div>
            </div>
          </div>
          <TeacherMultiSelect
            teachers={teachers}
            selectedIds={teacherIds}
            onChange={setTeacherIds}
            idPrefix={`edit-group-${group.id}-teacher`}
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
              {isPending ? 'Spremam...' : 'Spremi'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
