import { Skeleton } from '@/components/ui/skeleton'

export default function PortalGroupMaterijaliLoading() {
  return (
    <div className="space-y-7">
      <Skeleton className="h-[104px] w-full rounded-xl" />
      <div>
        <Skeleton className="mb-3.5 h-6 w-44" />
        <div className="mb-4 flex gap-2">
          {Array.from({ length: 4 }, (_, i) => `chip-${i}`).map((key) => (
            <Skeleton key={key} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => `card-${i}`).map((key) => (
            <Skeleton key={key} className="h-[92px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
