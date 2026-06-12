import { RotateCcw } from 'lucide-react'
import { RETURNING_INQUIRY_LABEL } from '@/lib/inquiry-status'
import { cn } from '@/lib/utils'

interface ReturningInquiryBadgeProps {
  className?: string
}

/**
 * Derived marker shown when an inquiry's child (name + DOB) already exists as a
 * student. Rendered next to the lifecycle status badge / in the list, never
 * replacing it.
 */
export function ReturningInquiryBadge({ className }: Readonly<ReturningInquiryBadgeProps>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-100 text-violet-800 border-violet-200',
        className,
      )}
    >
      <RotateCcw className="w-3 h-3" />
      {RETURNING_INQUIRY_LABEL}
    </span>
  )
}
