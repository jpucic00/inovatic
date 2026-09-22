import { Hourglass } from 'lucide-react'
import { WAITLIST_LABEL } from '@/lib/inquiry-status'
import { cn } from '@/lib/utils'

interface WaitlistBadgeProps {
  className?: string
}

/**
 * The lista čekanja marker. Rendered next to the lifecycle status badge, never
 * replacing it — a waitlisted upit keeps its status (see Inquiry.waitlistedAt).
 */
export function WaitlistBadge({ className }: Readonly<WaitlistBadgeProps>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-100 text-orange-800 border-orange-200 whitespace-nowrap',
        className,
      )}
    >
      <Hourglass className="w-3 h-3" />
      {WAITLIST_LABEL}
    </span>
  )
}
