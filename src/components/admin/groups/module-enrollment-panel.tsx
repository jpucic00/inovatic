'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, XCircle, Users } from 'lucide-react'
import {
  deleteModuleEnrollment,
  addModuleEnrollment,
} from '@/actions/admin/module-enrollment'
import {
  getActiveModuleForGroup,
  getGroupModuleArc,
  type GroupModuleArcEntry,
} from '@/lib/group-module-arc'
import { formatDate } from '@/lib/format'
import { tabClass } from '@/lib/ui-classes'
import Link from 'next/link'

type ModuleInfo = {
  id: string
  title: string
  sortOrder: number
  scheduleId: string | null
  startDate: Date | null
  endDate: Date | null
}

type ModuleEnrollmentInfo = {
  id: string
  moduleSchedule: {
    id: string
    module: { id: string; title: string; sortOrder: number }
  }
}

type EnrollmentInfo = {
  id: string
  user: { id: string; firstName: string; lastName: string; email: string }
  moduleEnrollments: ModuleEnrollmentInfo[]
}

interface ModuleEnrollmentPanelProps {
  modules: ModuleInfo[]
  enrollments: EnrollmentInfo[]
  maxStudents: number
  editable: boolean
  /** Group's weekday — drives per-group arc race-ahead. Null for radionice. */
  dayOfWeek: string | null
  /** YYYY-MM-DD keys for the group's school-year holidays. */
  holidayDateKeys: string[]
}

type ModuleStatus = { label: string; className: string }

function statusFromArcContext(
  mod: ModuleInfo,
  arcByModuleId: Map<string, GroupModuleArcEntry>,
  inProgressModuleId: string | null,
  lastCompletedModuleId: string | null,
): ModuleStatus {
  if (!mod.scheduleId || !mod.startDate || !mod.endDate) {
    return { label: 'Nema datuma', className: 'text-gray-400 bg-gray-50' }
  }
  const arcEntry = arcByModuleId.get(mod.id)
  if (!arcEntry) {
    // Per-group arc couldn't include this module (likely missing date or
    // earlier-module gap). Fall back to course-window comparison.
    const now = new Date()
    if (now < new Date(mod.startDate))
      return { label: 'Nadolazi', className: 'text-blue-600 bg-blue-50' }
    if (now > new Date(mod.endDate))
      return { label: 'Završen', className: 'text-gray-500 bg-gray-100' }
    return { label: 'Aktivan', className: 'text-green-700 bg-green-50' }
  }
  if (mod.id === inProgressModuleId)
    return { label: 'Aktivan', className: 'text-green-700 bg-green-50' }
  // Completed modules: arc entry's lastSession is in the past.
  if (mod.id === lastCompletedModuleId || arcEntry.lastSession.getTime() < Date.now())
    return { label: 'Završen', className: 'text-gray-500 bg-gray-100' }
  return { label: 'Nadolazi', className: 'text-blue-600 bg-blue-50' }
}

function ModuleTab({
  mod,
  enrollments,
  maxStudents,
  nextModuleScheduleId,
  editable,
  status,
  arcEntry,
}: Readonly<{
  mod: ModuleInfo
  enrollments: EnrollmentInfo[]
  maxStudents: number
  nextModuleScheduleId: string | null
  editable: boolean
  status: ModuleStatus
  arcEntry: GroupModuleArcEntry | null
}>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const scheduleId = mod.scheduleId
  const enrolledInModule = scheduleId
    ? enrollments.filter((e) =>
        e.moduleEnrollments.some((me) => me.moduleSchedule.id === scheduleId),
      )
    : []
  const notInModule = scheduleId
    ? enrollments.filter(
        (e) => !e.moduleEnrollments.some((me) => me.moduleSchedule.id === scheduleId),
      )
    : enrollments
  const spotsUsed = enrolledInModule.length
  const spotsAvailable = maxStudents - spotsUsed

  const handleAddToNextModule = (enrollmentId: string) => {
    if (!nextModuleScheduleId) return
    startTransition(async () => {
      const res = await addModuleEnrollment(enrollmentId, nextModuleScheduleId)
      if (res.success) {
        toast.success('Polaznik dodan u sljedeći modul.')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška.')
      }
    })
  }

  const handleRemoveFromModule = (moduleEnrollmentId: string) => {
    startTransition(async () => {
      const res = await deleteModuleEnrollment(moduleEnrollmentId)
      if (res.success) {
        toast.success('Polaznik uklonjen iz modula.')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška.')
      }
    })
  }

  if (!scheduleId) {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-400 italic">Nema rasporeda za ovaj modul u ovoj školskoj godini.</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">{mod.title}</h3>
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.className}`}>
            {status.label}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          <Users className="w-3.5 h-3.5 inline mr-1" />
          {spotsUsed}/{maxStudents}
          {spotsAvailable > 0 && (
            <span className="text-green-600 ml-1">({spotsAvailable} slobodnih)</span>
          )}
        </span>
      </div>

      {arcEntry ? (
        <p className="text-xs text-gray-400 mb-3">
          {formatDate(arcEntry.firstSession)} – {formatDate(arcEntry.lastSession)}{' '}
          <span className="text-gray-300">(7 sjednica)</span>
        </p>
      ) : (
        mod.startDate &&
        mod.endDate && (
          <p className="text-xs text-gray-400 mb-3">
            {formatDate(mod.startDate)} – {formatDate(mod.endDate)}
          </p>
        )
      )}

      {enrolledInModule.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nema polaznika u ovom modulu.</p>
      ) : (
        <div className="divide-y">
          {enrolledInModule.map((enrollment) => {
            const meForModule = enrollment.moduleEnrollments.find(
              (me) => me.moduleSchedule.id === scheduleId,
            )
            const hasNextModule = nextModuleScheduleId
              ? enrollment.moduleEnrollments.some(
                  (me) => me.moduleSchedule.id === nextModuleScheduleId,
                )
              : false

            return (
              <div key={enrollment.id} className="py-2.5 flex items-center justify-between">
                <Link
                  href={`/admin/ucenici/${enrollment.user.id}`}
                  className="text-sm font-medium text-gray-900 hover:text-cyan-600 transition-colors"
                >
                  {enrollment.user.firstName} {enrollment.user.lastName}
                </Link>
                <div className="flex items-center gap-1.5">
                  {editable && nextModuleScheduleId && !hasNextModule && (
                    <button
                      onClick={() => handleAddToNextModule(enrollment.id)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded hover:bg-cyan-100 transition-colors disabled:opacity-50"
                      title="Dodaj u sljedeći modul"
                    >
                      <Plus className="w-3 h-3" />
                      Sljedeći
                    </button>
                  )}
                  {editable && meForModule && (
                    <button
                      onClick={() => handleRemoveFromModule(meForModule.id)}
                      disabled={isPending}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Ukloni iz modula"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editable && notInModule.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            {notInModule.length} polaznika grupe bez ovog modula
          </summary>
          <div className="mt-2 divide-y">
            {notInModule.map((enrollment) => (
              <div key={enrollment.id} className="py-2 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {enrollment.user.firstName} {enrollment.user.lastName}
                </span>
                <button
                  onClick={() => {
                    startTransition(async () => {
                      const res = await addModuleEnrollment(enrollment.id, scheduleId)
                      if (res.success) {
                        toast.success('Polaznik dodan u modul.')
                        router.refresh()
                      } else {
                        toast.error(res.error ?? 'Greška.')
                      }
                    })
                  }}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-700 bg-cyan-50 rounded hover:bg-cyan-100 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  Dodaj
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export function ModuleEnrollmentPanel({
  modules,
  enrollments,
  maxStudents,
  editable,
  dayOfWeek,
  holidayDateKeys,
}: Readonly<ModuleEnrollmentPanelProps>) {
  // Compute the group's race-ahead arc once per render. Pure + tiny — fine on
  // the client. Holidays travel as a string[] across the server boundary and
  // we wrap them back into a Set the arc primitive expects.
  const { arcByModuleId, inProgressModuleId, lastCompletedModuleId } = useMemo(() => {
    const holidays = new Set(holidayDateKeys)
    const arc = getGroupModuleArc({
      dayOfWeek,
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        sortOrder: m.sortOrder,
        schedule:
          m.scheduleId && m.startDate && m.endDate
            ? { id: m.scheduleId, startDate: m.startDate, endDate: m.endDate }
            : null,
      })),
      holidayDates: holidays,
    })
    const state = getActiveModuleForGroup(arc, new Date())
    const byId = new Map(arc.map((e) => [e.moduleId, e]))
    return {
      arcByModuleId: byId,
      inProgressModuleId: state.inProgressModule?.moduleId ?? null,
      lastCompletedModuleId: state.lastCompletedModule?.moduleId ?? null,
    }
  }, [modules, dayOfWeek, holidayDateKeys])

  const [expandedIdx, setExpandedIdx] = useState(() => {
    if (inProgressModuleId !== null) {
      const idx = modules.findIndex((m) => m.id === inProgressModuleId)
      if (idx >= 0) return idx
    }
    return 0
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap gap-1 border-b border-gray-200 overflow-x-auto overflow-y-hidden mb-2 sm:overflow-visible">
        {modules.map((mod, idx) => {
          const enrolledCount = mod.scheduleId
            ? enrollments.filter((e) =>
                e.moduleEnrollments.some((me) => me.moduleSchedule.id === mod.scheduleId),
              ).length
            : 0
          const isActive = expandedIdx === idx
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => setExpandedIdx(idx)}
              className={`${tabClass(isActive)} sm:whitespace-normal sm:text-center sm:min-w-0`}
            >
              {mod.title} ({enrolledCount})
            </button>
          )
        })}
      </div>
      {modules[expandedIdx] && (
        <ModuleTab
          mod={modules[expandedIdx]}
          enrollments={enrollments}
          maxStudents={maxStudents}
          nextModuleScheduleId={modules[expandedIdx + 1]?.scheduleId ?? null}
          editable={editable}
          status={statusFromArcContext(
            modules[expandedIdx],
            arcByModuleId,
            inProgressModuleId,
            lastCompletedModuleId,
          )}
          arcEntry={arcByModuleId.get(modules[expandedIdx].id) ?? null}
        />
      )}
    </div>
  )
}
