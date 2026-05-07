import { Skeleton } from '@/components/ui/skeleton'

export default function TeacherGroupLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-40 mb-4" />
      <div className="mb-6">
        <Skeleton className="h-8 w-72 mb-2" />
        <Skeleton className="h-4 w-48 mb-3" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {Array.from({ length: 5 }, (_, i) => `tab-${i}`).map(key => (
          <Skeleton key={key} className="h-8 w-24" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => `row-${i}`).map(key => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
