import { Skeleton } from '@/components/ui/skeleton'

const MONTH_CARD_SLOTS = [
  'month-1',
  'month-2',
  'month-3',
  'month-4',
  'month-5',
  'month-6',
] as const

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {MONTH_CARD_SLOTS.map((slot) => (
          <Skeleton key={slot} className="h-64 w-full" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
