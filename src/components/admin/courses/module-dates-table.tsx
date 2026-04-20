'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Calendar, Check, X, Pencil, Users, CheckCircle } from 'lucide-react'
import { updateModuleSchedule } from '@/actions/admin/module'
import { closeModuleSchedule } from '@/actions/admin/module-enrollment'
import Link from 'next/link'

type Module = {
  id: string
  title: string
  sortOrder: number
  scheduleId: string | null
  startDate: Date | null
  endDate: Date | null
  enrollmentCount: number
}

type CourseInfo = {
  id: string
  title: string
  level: string | null
  ageMin: number
  ageMax: number
  equipment: string | null
  groupCount: number
}

interface ModuleDatesTableProps {
  course: CourseInfo
  modules: Module[]
}

function formatDate(d: Date | null): string {
  if (!d) return '–'
  const date = new Date(d)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}.`
}

function toInputDate(d: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  return date.toISOString().split('T')[0]
}

function getModuleStatus(mod: Module): { label: string; className: string } {
  const now = new Date()
  if (!mod.startDate || !mod.endDate) return { label: 'Nema datuma', className: 'text-gray-400' }
  if (now < new Date(mod.startDate)) return { label: 'Nadolazi', className: 'text-blue-600 bg-blue-50' }
  if (now > new Date(mod.endDate)) return { label: 'Završen', className: 'text-gray-500 bg-gray-100' }
  return { label: 'Aktivan', className: 'text-green-700 bg-green-50' }
}

function ModuleRow({ mod }: Readonly<{ mod: Module }>) {
  const [editing, setEditing] = useState(false)
  const [startDate, setStartDate] = useState(toInputDate(mod.startDate))
  const [endDate, setEndDate] = useState(toInputDate(mod.endDate))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const status = getModuleStatus(mod)

  const handleSave = () => {
    if (!mod.scheduleId) return
    startTransition(async () => {
      const result = await updateModuleSchedule({
        id: mod.scheduleId!,
        startDate: startDate || null,
        endDate: endDate || null,
      })
      if (result.success) {
        toast.success('Datumi modula ažurirani.')
        setEditing(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleCloseModule = () => {
    if (!mod.scheduleId) return
    startTransition(async () => {
      const result = await closeModuleSchedule(mod.scheduleId!)
      if (result.success) {
        toast.success(`Modul "${mod.title}" završen.`)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  const handleCancel = () => {
    setStartDate(toInputDate(mod.startDate))
    setEndDate(toInputDate(mod.endDate))
    setEditing(false)
  }

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2.5 pr-4">
        <span className="text-sm text-gray-800">{mod.title}</span>
      </td>
      <td className="py-2.5 pr-4">
        {editing ? (
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        ) : (
          <span className="text-sm text-gray-600">{formatDate(mod.startDate)}</span>
        )}
      </td>
      <td className="py-2.5 pr-4">
        {editing ? (
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        ) : (
          <span className="text-sm text-gray-600">{formatDate(mod.endDate)}</span>
        )}
      </td>
      <td className="py-2.5 pr-4">
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.className}`}>
          {status.label}
        </span>
      </td>
      <td className="py-2.5 pr-4">
        {mod.scheduleId ? (
          <Link
            href={`/admin/ucenici?scheduleId=${mod.scheduleId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-md hover:bg-cyan-100 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            {mod.enrollmentCount} {mod.enrollmentCount === 1 ? 'polaznik' : 'polaznika'}
          </Link>
        ) : (
          <span className="text-xs text-gray-400">–</span>
        )}
      </td>
      <td className="py-2.5 text-right">
        {mod.scheduleId && (
          editing ? (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                title="Spremi"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded transition-colors"
                title="Odustani"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              {status.label === 'Aktivan' && (
                <button
                  onClick={handleCloseModule}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
                  title="Završi modul za sve grupe (postavi krajnji datum na danas)"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Završi
                </button>
              )}
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded transition-colors"
                title="Uredi datume"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        )}
      </td>
    </tr>
  )
}

export function ModuleDatesTable({ course, modules }: Readonly<ModuleDatesTableProps>) {
  if (modules.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-cyan-600 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{course.title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {course.level && (
                <span className="text-xs text-gray-500">{course.level.replace('_', ' ')}</span>
              )}
              <span className="text-xs text-gray-400">{course.ageMin}–{course.ageMax} god.</span>
              {course.equipment && (
                <>
                  <span className="text-xs text-gray-300">|</span>
                  <span className="text-xs text-gray-400">{course.equipment}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Link
          href={`/admin/grupe?tab=${course.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-full hover:bg-cyan-100 transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          {course.groupCount} {course.groupCount >= 2 && course.groupCount <= 4 ? 'grupe' : 'grupa'}
        </Link>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Modul</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Početak</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Završetak</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Status</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide pb-2 pr-4">Polaznici</th>
            <th className="pb-2 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {modules.map((mod) => (
            <ModuleRow key={mod.id} mod={mod} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
