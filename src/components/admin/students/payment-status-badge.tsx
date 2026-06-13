import { cn } from '@/lib/utils'
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type PaymentStatus,
} from '@/lib/payment-status'

interface Props {
  status: PaymentStatus
  className?: string
}

export function PaymentStatusBadge({ status, className }: Readonly<Props>) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        PAYMENT_STATUS_COLORS[status],
        className,
      )}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  )
}
