import { Skeleton } from '@/components/ui/skeleton'

export default function PortalLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-64 mb-2" />
      <Skeleton className="h-4 w-40 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-5 rounded-lg border border-gray-200 bg-white">
            <Skeleton className="h-5 w-48 mb-3" />
            <Skeleton className="h-3 w-32 mb-2" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  )
}
