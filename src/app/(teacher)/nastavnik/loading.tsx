import { Skeleton } from '@/components/ui/skeleton'

export default function TeacherLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-40 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map(key => (
          <div key={key} className="p-5 rounded-lg border border-gray-200 bg-white">
            <Skeleton className="h-5 w-40 mb-3" />
            <Skeleton className="h-3 w-32 mb-2" />
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  )
}
