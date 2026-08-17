import { RotateCcw } from 'lucide-react'
import { RETURNING_INQUIRY_LABEL } from '@/lib/inquiry-status'
import { cn } from '@/lib/utils'

interface ReturningBadgeProps {
  className?: string
}

/**
 * The "Ponovni upis" marker, shared by the two lists that derive it differently
 * — an upit whose child already has an account, and a student enrolled this
 * school year who was also enrolled in an earlier one (see
 * `src/lib/returning-filter.ts`). One badge on purpose: to the admin reading
 * either table it is the same fact about the same family, and two colours for
 * it would read as two different things.
 *
 * Rendered next to the lifecycle status badge, never replacing it.
 */
export function ReturningBadge({ className }: Readonly<ReturningBadgeProps>) {
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
