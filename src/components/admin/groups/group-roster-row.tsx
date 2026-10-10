import { FileCheck, FileX } from 'lucide-react'
import { PaymentStatusBadge } from '@/components/admin/students/payment-status-badge'
import { PhotoConsentNote } from '@/components/shared/photo-consent-note'
import { formatDate } from '@/lib/format'
import type { GroupRosterStatus } from '@/lib/group-roster-status'

/** Plaćanje · Ugovor · privole — what decides whether a child has actually signed up. */
export function GroupRosterBadges({ status }: Readonly<{ status: GroupRosterStatus }>) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <PaymentStatusBadge status={status.paymentStatus} className="px-1.5 text-[10px]" />
      {status.contractSignedAt ? (
        <span
          className="inline-flex items-center gap-0.5 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700"
          title={`Ugovor potpisan ${formatDate(status.contractSignedAt)}`}
        >
          <FileCheck className="size-3" aria-hidden />
          Ugovor potpisan
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
          <FileX className="size-3" aria-hidden />
          Bez ugovora
        </span>
      )}
      <PhotoConsentNote consents={status.consents} />
    </div>
  )
}
