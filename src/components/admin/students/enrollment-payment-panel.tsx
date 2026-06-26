'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { setModulePaid, setEnrollmentYearPaid } from '@/actions/admin/payment'

type PaymentModule = {
  moduleEnrollmentId: string
  title: string
  paidAt: Date | null
}

interface Props {
  enrollmentId: string
  isCustom: boolean
  fullYearPaidAt: Date | null
  modules: PaymentModule[]
}

const YEAR_KEY = '__year__'

function formatDate(value: Date): string {
  const d = new Date(value)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}.`
}

function RadionicaPaymentSection({
  yearPaid,
  fullYearPaidAt,
  busy,
  onToggle,
}: Readonly<{
  yearPaid: boolean
  fullYearPaidAt: Date | null
  busy: boolean
  onToggle: () => void
}>) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-500 mb-1.5">Plaćanje</p>
      {yearPaid ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700">
            <Check className="w-3 h-3" />
            Plaćeno · {fullYearPaidAt ? formatDate(fullYearPaidAt) : ''}
          </span>
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            {busy ? '...' : 'Poništi'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 disabled:opacity-50"
        >
          {busy ? <span className="text-[10px]">...</span> : <Plus className="w-3 h-3" />}
          Označi plaćeno
        </button>
      )}
    </div>
  )
}

function ModulePaymentChip({
  module,
  isPending,
  pendingId,
  yearPaid,
  onToggle,
}: Readonly<{
  module: PaymentModule
  isPending: boolean
  pendingId: string | null
  yearPaid: boolean
  onToggle: () => void
}>) {
  const busy = isPending && pendingId === module.moduleEnrollmentId
  const paid = module.paidAt !== null || yearPaid

  if (yearPaid) {
    return (
      <span
        title="Pokriveno oznakom plaćene cijele godine"
        className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700 opacity-70"
      >
        <Check className="w-3 h-3" />
        {module.title}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      title={paid ? 'Označi kao neplaćeno' : 'Označi kao plaćeno'}
      className={
        paid
          ? 'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 disabled:opacity-50'
          : 'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50'
      }
    >
      {busy ? (
        <span className="text-[10px]">...</span>
      ) : paid ? (
        <Check className="w-3 h-3" />
      ) : (
        <X className="w-3 h-3" />
      )}
      {module.title}
    </button>
  )
}

export function EnrollmentPaymentPanel({
  enrollmentId,
  isCustom,
  fullYearPaidAt,
  modules,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const yearPaid = fullYearPaidAt !== null

  const run = (
    id: string,
    action: () => Promise<{ success: boolean; error?: string }>,
    okMessage: string,
  ) => {
    setPendingId(id)
    startTransition(async () => {
      const res = await action()
      setPendingId(null)
      if (res.success) {
        toast.success(okMessage)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška pri spremanju plaćanja.')
      }
    })
  }

  const toggleModule = (m: PaymentModule) => {
    const paid = m.paidAt === null
    run(
      m.moduleEnrollmentId,
      () => setModulePaid(m.moduleEnrollmentId, paid),
      paid ? 'Plaćanje označeno.' : 'Oznaka plaćanja uklonjena.',
    )
  }

  const toggleYear = () => {
    const paid = !yearPaid
    run(
      YEAR_KEY,
      () => setEnrollmentYearPaid(enrollmentId, paid),
      paid ? 'Plaćanje označeno.' : 'Oznaka plaćanja uklonjena.',
    )
  }

  const yearBusy = isPending && pendingId === YEAR_KEY

  // Radionica: the enrollment itself is the single payable item.
  if (isCustom) {
    return (
      <RadionicaPaymentSection
        yearPaid={yearPaid}
        fullYearPaidAt={fullYearPaidAt}
        busy={yearBusy}
        onToggle={toggleYear}
      />
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-500 mb-1.5">Plaćanje</p>

      {/* Whole school year mark */}
      <div className="flex flex-wrap items-center gap-2">
        {yearPaid ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700">
              <Check className="w-3 h-3" />
              Cijela godina plaćena · {formatDate(fullYearPaidAt)}
            </span>
            <button
              type="button"
              onClick={toggleYear}
              disabled={yearBusy}
              className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              {yearBusy ? '...' : 'Poništi'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggleYear}
            disabled={yearBusy}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 disabled:opacity-50"
          >
            {yearBusy ? <span className="text-[10px]">...</span> : <Plus className="w-3 h-3" />}
            Označi cijelu godinu plaćenom
          </button>
        )}
      </div>

      {/* Per-module marks */}
      {modules.length > 0 ? (
        <div className="flex flex-wrap gap-2 mt-2">
          {modules.map((m) => (
            <ModulePaymentChip
              key={m.moduleEnrollmentId}
              module={m}
              isPending={isPending}
              pendingId={pendingId}
              yearPaid={yearPaid}
              onToggle={() => toggleModule(m)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-2">Nema upisanih modula.</p>
      )}
    </div>
  )
}
