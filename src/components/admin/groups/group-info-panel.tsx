'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, MapPin, Clock, Calendar, ExternalLink } from 'lucide-react'
import { createGroupSchema, type CreateGroupInput } from '@/lib/validators/admin/group'
import { updateGroup } from '@/actions/admin/group'
import { DAYS_HR, formatDate, formatDateKey } from '@/lib/format'
import { adminInputClass, adminSelectClass } from '@/lib/admin-styles'
import { DateInput } from '@/components/ui/date-input'
import {
  getEnrollmentWindowState,
  ENROLLMENT_WINDOW_LABEL,
  ENROLLMENT_WINDOW_COLOR,
} from '@/lib/enrollment-window'

type CourseOption = { id: string; title: string; isCustom: boolean }
type LocationOption = { id: string; name: string }

type GroupForEdit = {
  id: string
  courseId: string
  locationId: string
  name: string | null
  dateStart: string | null
  dateEnd: string | null
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  schoolYear: string
  maxStudents: number
  enrollmentStart: Date | null
  enrollmentEnd: Date | null
  course: { id: string; title: string; level: string | null; isCustom: boolean }
  location: { id: string; name: string }
  enrolledCount: number
}

interface Props {
  group: GroupForEdit
  courses: CourseOption[]
  locations: LocationOption[]
  editable: boolean
}

function DetailRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b last:border-b-0">
      <dt className="text-sm font-medium text-gray-500 sm:w-44 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  )
}

function getCapacityColor(pct: number): string {
  if (pct >= 1) return 'text-red-600'
  if (pct >= 0.75) return 'text-amber-600'
  return 'text-green-600'
}

export function GroupInfoPanel({ group, courses, locations, editable }: Readonly<Props>) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')

  if (mode === 'edit' && editable) {
    return (
      <GroupInfoEdit
        group={group}
        courses={courses}
        locations={locations}
        onCancel={() => setMode('view')}
        onSaved={() => setMode('view')}
      />
    )
  }

  return <GroupInfoView group={group} editable={editable} onEdit={() => setMode('edit')} />
}

function GroupInfoView({
  group,
  editable,
  onEdit,
}: Readonly<{ group: GroupForEdit; editable: boolean; onEdit: () => void }>) {
  const windowState = getEnrollmentWindowState(group.enrollmentStart, group.enrollmentEnd)
  const availableSpots = group.maxStudents - group.enrolledCount
  const pct = group.maxStudents > 0 ? group.enrolledCount / group.maxStudents : 0
  const capacityColor = getCapacityColor(pct)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700">Informacije o grupi</h2>
        {editable && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            title="Uredi grupu"
          >
            <Pencil className="w-3.5 h-3.5" />
            Uredi
          </button>
        )}
      </div>
      <dl>
        <DetailRow
          label="Program"
          value={
            <span>
              {group.course.title}
              {group.course.level && (
                <span className="text-gray-400 ml-1">({group.course.level})</span>
              )}
            </span>
          }
        />
        <DetailRow
          label="Naziv grupe"
          value={group.name ?? <span className="text-gray-400 italic">–</span>}
        />
        <DetailRow
          label="Lokacija"
          value={
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {group.location.name}
            </span>
          }
        />
        <DetailRow
          label="Termin"
          value={<TerminValue group={group} />}
        />
        {group.schoolYear && (
          <DetailRow label="Školska godina" value={group.schoolYear} />
        )}
        <DetailRow
          label="Kapacitet"
          value={
            <span className={capacityColor}>
              {group.enrolledCount}/{group.maxStudents} polaznika
              {availableSpots > 0 && (
                <span className="text-gray-400 font-normal"> ({availableSpots} slobodnih)</span>
              )}
            </span>
          }
        />
        <DetailRow
          label="Prozor upisa"
          value={
            <div>
              <span className={ENROLLMENT_WINDOW_COLOR[windowState]}>
                {ENROLLMENT_WINDOW_LABEL[windowState]}
              </span>
              {windowState !== 'unset' && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {group.enrollmentStart && `Od: ${formatDate(group.enrollmentStart)}`}
                  {group.enrollmentStart && group.enrollmentEnd && ' – '}
                  {group.enrollmentEnd && `Do: ${formatDate(group.enrollmentEnd)}`}
                </p>
              )}
              <Link
                href={`/admin/programi/${group.courseId}`}
                className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline mt-1"
              >
                <ExternalLink className="w-3 h-3" />
                Uredi u programu
              </Link>
            </div>
          }
        />
      </dl>
    </div>
  )
}

function TimeSlot({ startTime, endTime }: Readonly<{ startTime: string | null; endTime: string | null }>) {
  if (!startTime) return null
  return (
    <span className="flex items-center gap-1 ml-1">
      <Clock className="w-3.5 h-3.5 text-gray-400" />
      {startTime}
      {endTime && `–${endTime}`}
    </span>
  )
}

function TerminValue({ group }: Readonly<{ group: GroupForEdit }>) {
  if (group.course.isCustom && group.dateStart && group.dateEnd) {
    const rangeLabel =
      group.dateStart === group.dateEnd
        ? formatDateKey(group.dateStart)
        : `${formatDateKey(group.dateStart)} – ${formatDateKey(group.dateEnd)}`
    return (
      <span className="flex items-center gap-1">
        <Calendar className="w-3.5 h-3.5 text-gray-400" />
        {rangeLabel}
        <TimeSlot startTime={group.startTime} endTime={group.endTime} />
      </span>
    )
  }
  if (group.dayOfWeek) {
    return (
      <span className="flex items-center gap-1">
        <Calendar className="w-3.5 h-3.5 text-gray-400" />
        {group.dayOfWeek}
        <TimeSlot startTime={group.startTime} endTime={group.endTime} />
      </span>
    )
  }
  return <span className="text-gray-400 italic">Nije određen</span>
}

function GroupInfoEdit({
  group,
  courses,
  locations,
  onCancel,
  onSaved,
}: Readonly<{
  group: GroupForEdit
  courses: CourseOption[]
  locations: LocationOption[]
  onCancel: () => void
  onSaved: () => void
}>) {
  const [isPending, startTransition] = useTransition()
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
      dateStart: group.dateStart ?? '',
      dateEnd: group.dateEnd ?? '',
      dayOfWeek: (group.dayOfWeek ?? '') as CreateGroupInput['dayOfWeek'],
      startTime: group.startTime ?? '',
      endTime: group.endTime ?? '',
      maxStudents: group.maxStudents,
    },
  })

  const selectedCourseId = useWatch({ control, name: 'courseId' })
  const isRadionica = courses.find((c) => c.id === selectedCourseId)?.isCustom ?? false

  function onSubmit(data: CreateGroupInput) {
    startTransition(async () => {
      const result = await updateGroup({ id: group.id, ...data })
      if (result.success) {
        toast.success('Grupa ažurirana.')
        router.refresh()
        onSaved()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Uredi grupu</h2>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="info-courseId" className="block text-sm font-medium text-gray-700 mb-1">Program *</label>
          <select id="info-courseId" {...register('courseId')} className={adminSelectClass}>
            <option value="">– Odaberite program –</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          {errors.courseId && <p className="text-xs text-red-600 mt-1">{errors.courseId.message}</p>}
        </div>
        <div>
          <label htmlFor="info-locationId" className="block text-sm font-medium text-gray-700 mb-1">Lokacija *</label>
          <select id="info-locationId" {...register('locationId')} className={adminSelectClass}>
            <option value="">– Odaberite lokaciju –</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {errors.locationId && <p className="text-xs text-red-600 mt-1">{errors.locationId.message}</p>}
        </div>
        <div>
          <label htmlFor="info-name" className="block text-sm font-medium text-gray-700 mb-1">Naziv grupe *</label>
          <input id="info-name" {...register('name')} className={adminInputClass} placeholder="npr. Grupa A, Ujutro" />
          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
        </div>
        {isRadionica ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="info-dateStart" className="block text-sm font-medium text-gray-700 mb-1">Početak *</label>
                <Controller name="dateStart" control={control} render={({ field }) => <DateInput id="info-dateStart" value={field.value ?? ''} onChange={field.onChange} className={adminInputClass} />} />
                {errors.dateStart && <p className="text-xs text-red-600 mt-1">{errors.dateStart.message}</p>}
              </div>
              <div>
                <label htmlFor="info-dateEnd" className="block text-sm font-medium text-gray-700 mb-1">Kraj *</label>
                <Controller name="dateEnd" control={control} render={({ field }) => <DateInput id="info-dateEnd" value={field.value ?? ''} onChange={field.onChange} className={adminInputClass} />} />
                {errors.dateEnd && <p className="text-xs text-red-600 mt-1">{errors.dateEnd.message}</p>}
              </div>
            </div>
            <p className="text-xs text-gray-500">Radionica se održava svaki dan u rasponu u istom terminu.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="info-startTime" className="block text-sm font-medium text-gray-700 mb-1">Vrijeme početka *</label>
                <input id="info-startTime" {...register('startTime')} className={adminInputClass} placeholder="19:00" />
                {errors.startTime && <p className="text-xs text-red-600 mt-1">{errors.startTime.message}</p>}
              </div>
              <div>
                <label htmlFor="info-endTime" className="block text-sm font-medium text-gray-700 mb-1">Vrijeme kraja *</label>
                <input id="info-endTime" {...register('endTime')} className={adminInputClass} placeholder="20:30" />
                {errors.endTime && <p className="text-xs text-red-600 mt-1">{errors.endTime.message}</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="info-dayOfWeek" className="block text-sm font-medium text-gray-700 mb-1">Dan *</label>
              <select id="info-dayOfWeek" {...register('dayOfWeek')} className={adminSelectClass}>
                <option value="">–</option>
                {DAYS_HR.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              {errors.dayOfWeek && <p className="text-xs text-red-600 mt-1">{errors.dayOfWeek.message}</p>}
            </div>
            <div>
              <label htmlFor="info-startTime" className="block text-sm font-medium text-gray-700 mb-1">Početak *</label>
              <input id="info-startTime" {...register('startTime')} className={adminInputClass} placeholder="19:00" />
              {errors.startTime && <p className="text-xs text-red-600 mt-1">{errors.startTime.message}</p>}
            </div>
            <div>
              <label htmlFor="info-endTime" className="block text-sm font-medium text-gray-700 mb-1">Kraj *</label>
              <input id="info-endTime" {...register('endTime')} className={adminInputClass} placeholder="20:30" />
              {errors.endTime && <p className="text-xs text-red-600 mt-1">{errors.endTime.message}</p>}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="info-maxStudents" className="block text-sm font-medium text-gray-700 mb-1">Max polaznika</label>
          <input id="info-maxStudents" {...register('maxStudents')} type="number" min={1} max={50} className={adminInputClass} />
          {errors.maxStudents && <p className="text-xs text-red-600 mt-1">{errors.maxStudents.message}</p>}
        </div>
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
          Prozor upisa uređuje se na stranici programa i vrijedi za sve grupe tog programa.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
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
    </div>
  )
}
