'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ProgramKind } from '@prisma/client'
import {
  setEnrollmentMonthPaid,
  setEnrollmentYearPaid,
  setModulePaid,
} from '@/actions/admin/payment'
import { formatDate, formatMonthYear } from '@/lib/format'
import { isMonthlyBilled, isRadionica } from '@/lib/program-kind'

type PaymentModule = {
  moduleEnrollmentId: string
  title: string
  paidAt: Date | null
}

type PaymentMonth = {
  enrollmentMonthId: string
  /** First day of the billed month, at UTC midnight. */
  periodStart: Date
  paidAt: Date | null
}

interface Props {
  enrollmentId: string
  kind: ProgramKind
  fullYearPaidAt: Date | null
  modules: PaymentModule[]
  /** Monthly-fee items. Empty for every kind except COMPETITION. */
  months?: PaymentMonth[]
}

const YEAR_KEY = '__year__'

/** "Ruj 2026." — short enough that a whole season fits on one or two rows. */
function shortMonthLabel(periodStart: Date): string {
  return formatMonthYear(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1)
}

/**
 * One chip per month of the season. A month only reads as unpaid once it has
 * actually started — future months are muted rather than red, so a September
 * enrollment does not look like nine months of debt on day one.
 */
function MonthlyPaymentSection({
  months,
  yearPaid,
  fullYearPaidAt,
  yearBusy,
  isPending,
  pendingId,
  onToggleYear,
  onToggleMonth,
}: Readonly<{
  months: PaymentMonth[]
  yearPaid: boolean
  fullYearPaidAt: Date | null
  yearBusy: boolean
  isPending: boolean
  pendingId: string | null
  onToggleYear: () => void
  onToggleMonth: (m: PaymentMonth) => void
}>) {
  // Compared against the first of the CURRENT month, so a month flips to owed
  // on the 1st — the same boundary `isEnrollmentPending` uses.
  const now = new Date()
  const currentMonth = Date.UTC(now.getFullYear(), now.getMonth(), 1)

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-500 mb-1.5">Plaćanje (mjesečna članarina)</p>

      <div className="flex flex-wrap items-center gap-2">
        {yearPaid ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700">
              <Check className="w-3 h-3" />
              Cijela godina plaćena · {formatDate(fullYearPaidAt)}
            </span>
            <button
              type="button"
              onClick={onToggleYear}
              disabled={yearBusy}
              className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              {yearBusy ? '...' : 'Poništi'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onToggleYear}
            disabled={yearBusy}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-700 disabled:opacity-50"
          >
            {yearBusy ? <span className="text-[10px]">...</span> : <Plus className="w-3 h-3" />}
            Cijela godina plaćena
          </button>
        )}
      </div>

      {months.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400 italic">
          Trajanje programa još nije određeno — mjeseci se generiraju kad se upišu datumi.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {months.map((m) => {
            const busy = isPending && pendingId === m.enrollmentMonthId
            const paid = m.paidAt !== null || yearPaid
            const future = m.periodStart.getTime() > currentMonth
            const label = shortMonthLabel(m.periodStart)

            if (yearPaid) {
              return (
                <span
                  key={m.enrollmentMonthId}
                  title="Pokriveno oznakom plaćene cijele godine"
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-green-50 border border-green-200 text-green-700 opacity-70"
                >
                  <Check className="w-3 h-3" />
                  {label}
                </span>
              )
            }

            let tone: string
            if (paid) {
              tone =
                'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
            } else if (future) {
              tone = 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100'
            } else {
              tone = 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
            }

            let icon
            if (busy) icon = <span className="text-[10px]">...</span>
            else if (paid) icon = <Check className="w-3 h-3" />
            else icon = <X className="w-3 h-3" />

            let title: string
            if (paid) title = 'Označi kao neplaćeno'
            else if (future) title = 'Mjesec još nije počeo — označi kao plaćeno unaprijed'
            else title = 'Označi kao plaćeno'

            return (
              <button
                key={m.enrollmentMonthId}
                type="button"
                onClick={() => onToggleMonth(m)}
                disabled={busy}
                title={title}
                className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border disabled:opacity-50 ${tone}`}
              >
                {icon}
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
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

  let icon
  if (busy) {
    icon = <span className="text-[10px]">...</span>
  } else if (paid) {
    icon = <Check className="w-3 h-3" />
  } else {
    icon = <X className="w-3 h-3" />
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
      {icon}
      {module.title}
    </button>
  )
}

export function EnrollmentPaymentPanel({
  enrollmentId,
  kind,
  fullYearPaidAt,
  modules,
  months = [],
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

  const toggleMonth = (m: PaymentMonth) => {
    const paid = m.paidAt === null
    run(
      m.enrollmentMonthId,
      () => setEnrollmentMonthPaid(m.enrollmentMonthId, paid),
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
  if (isRadionica(kind)) {
    return (
      <RadionicaPaymentSection
        yearPaid={yearPaid}
        fullYearPaidAt={fullYearPaidAt}
        busy={yearBusy}
        onToggle={toggleYear}
      />
    )
  }

  // Competition: one payable item per month of the season.
  if (isMonthlyBilled(kind)) {
    return (
      <MonthlyPaymentSection
        months={months}
        yearPaid={yearPaid}
        fullYearPaidAt={fullYearPaidAt}
        yearBusy={yearBusy}
        isPending={isPending}
        pendingId={pendingId}
        onToggleYear={toggleYear}
        onToggleMonth={toggleMonth}
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
