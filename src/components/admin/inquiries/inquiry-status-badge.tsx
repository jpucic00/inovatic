import { INQUIRY_STATUS_LABELS, INQUIRY_STATUS_COLORS } from '@/lib/inquiry-status'
import { cn } from '@/lib/utils'

interface InquiryStatusBadgeProps {
  status: string
  className?: string
}

export function InquiryStatusBadge({ status, className }: Readonly<InquiryStatusBadgeProps>) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        INQUIRY_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
        className,
      )}
    >
      {INQUIRY_STATUS_LABELS[status] ?? status}
    </span>
  )
}
