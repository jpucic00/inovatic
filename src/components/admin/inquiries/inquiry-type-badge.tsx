import { PartyPopper } from 'lucide-react'
import { INQUIRY_TYPE_LABELS, INQUIRY_TYPE_COLORS } from '@/lib/inquiry-status'
import { cn } from '@/lib/utils'

interface InquiryTypeBadgeProps {
  type: string
  className?: string
}

/**
 * Dedicated badge for the inquiry `type` discriminator. Renders only for PARTY
 * inquiries — COURSE is the implicit default and stays unlabeled — so it can be
 * dropped into lists/headers without a surrounding conditional.
 */
export function InquiryTypeBadge({ type, className }: Readonly<InquiryTypeBadgeProps>) {
  if (type !== 'PARTY') return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        INQUIRY_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-600 border-gray-200',
        className,
      )}
    >
      <PartyPopper className="w-3 h-3" />
      {INQUIRY_TYPE_LABELS[type] ?? type}
    </span>
  )
}
