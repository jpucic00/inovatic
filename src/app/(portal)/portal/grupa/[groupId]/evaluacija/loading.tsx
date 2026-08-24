import { Skeleton } from '@/components/ui/skeleton'

export default function PortalGroupEvaluacijaLoading() {
  return (
    <div className="max-w-3xl">
      <div className="rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4">
        <Skeleton className="h-3 w-full" />
        {Array.from({ length: 6 }, (_, i) => `skill-${i}`).map((key) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-48" />
          </div>
        ))}
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  )
}
