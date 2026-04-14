'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle, Plus, XCircle, Users } from 'lucide-react'
import {
  bulkCompleteModuleEnrollments,
  updateModuleEnrollmentStatus,
  addModuleEnrollment,
} from '@/actions/admin/module-enrollment'
import Link from 'next/link'

function fmtDate(d: Date): string {
  const date = new Date(d)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}.`
}

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
  status: string
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
  groupId: string
  modules: ModuleInfo[]
  enrollments: EnrollmentInfo[]
  maxStudents: number
}

function getModuleStatus(mod: ModuleInfo): { label: string; className: string } {
  const now = new Date()
  if (!mod.startDate || !mod.endDate) return { label: 'Nema datuma', className: 'text-gray-400 bg-gray-50' }
  if (now < new Date(mod.startDate)) return { label: 'Nadolazi', className: 'text-blue-600 bg-blue-50' }
  if (now > new Date(mod.endDate)) return { label: 'Završen', className: 'text-gray-500 bg-gray-100' }
  return { label: 'Aktivan', className: 'text-green-700 bg-green-50' }
}

function ModuleTab({
  mod,
  groupId,
  enrollments,
  maxStudents,
  nextModuleScheduleId,
}: Readonly<{
  mod: ModuleInfo
  groupId: string
  enrollments: EnrollmentInfo[]
  maxStudents: number
  nextModuleScheduleId: string | null
}>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const scheduleId = mod.scheduleId
  const enrolledInModule = scheduleId
    ? enrollments.filter((e) =>
        e.moduleEnrollments.some((me) => me.moduleSchedule.id === scheduleId && me.status === 'ACTIVE'),
      )
    : []
  const notInModule = scheduleId
    ? enrollments.filter(
        (e) => !e.moduleEnrollments.some((me) => me.moduleSchedule.id === scheduleId),
      )
    : enrollments
  const status = getModuleStatus(mod)
  const spotsUsed = enrolledInModule.length
  const spotsAvailable = maxStudents - spotsUsed

  const handleBulkComplete = () => {
    if (!scheduleId) return
    startTransition(async () => {
      const res = await bulkCompleteModuleEnrollments(groupId, scheduleId)
      if (res.success) {
        toast.success(`Modul "${mod.title}" završen za sve polaznike.`)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška.')
      }
    })
  }

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

  const handleCancelModuleEnrollment = (moduleEnrollmentId: string) => {
    startTransition(async () => {
      const res = await updateModuleEnrollmentStatus(moduleEnrollmentId, 'CANCELLED')
      if (res.success) {
        toast.success('Upis u modul otkazan.')
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
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            <Users className="w-3.5 h-3.5 inline mr-1" />
            {spotsUsed}/{maxStudents}
            {spotsAvailable > 0 && (
              <span className="text-green-600 ml-1">({spotsAvailable} slobodnih)</span>
            )}
          </span>
          {enrolledInModule.length > 0 && (
            <button
              onClick={handleBulkComplete}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Završi modul
            </button>
          )}
        </div>
      </div>

      {mod.startDate && mod.endDate && (
        <p className="text-xs text-gray-400 mb-3">
          {fmtDate(mod.startDate)} – {fmtDate(mod.endDate)}
        </p>
      )}

      {enrolledInModule.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Nema polaznika u ovom modulu.</p>
      ) : (
        <div className="divide-y">
          {enrolledInModule.map((enrollment) => {
            const meForModule = enrollment.moduleEnrollments.find(
              (me) => me.moduleSchedule.id === scheduleId && me.status === 'ACTIVE',
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
                  {nextModuleScheduleId && !hasNextModule && (
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
                  {meForModule && (
                    <button
                      onClick={() => handleCancelModuleEnrollment(meForModule.id)}
                      disabled={isPending}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Otkaži upis u modul"
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

      {notInModule.length > 0 && (
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
  groupId,
  modules,
  enrollments,
  maxStudents,
}: Readonly<ModuleEnrollmentPanelProps>) {
  const [expandedIdx, setExpandedIdx] = useState(() => {
    const now = new Date()
    const activeIdx = modules.findIndex(
      (m) => m.startDate && m.endDate && new Date(m.startDate) <= now && now <= new Date(m.endDate),
    )
    return activeIdx >= 0 ? activeIdx : 0
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2 mb-2">
        {modules.map((mod, idx) => {
          const status = getModuleStatus(mod)
          return (
            <button
              key={mod.id}
              onClick={() => setExpandedIdx(idx)}
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                expandedIdx === idx
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              M{mod.sortOrder}
              {status.label === 'Aktivan' && (
                <span className="ml-1 w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
              )}
            </button>
          )
        })}
      </div>
      {modules[expandedIdx] && (
        <ModuleTab
          mod={modules[expandedIdx]}
          groupId={groupId}
          enrollments={enrollments}
          maxStudents={maxStudents}
          nextModuleScheduleId={modules[expandedIdx + 1]?.scheduleId ?? null}
        />
      )}
    </div>
  )
}
