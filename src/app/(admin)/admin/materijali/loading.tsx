import { Skeleton } from '@/components/ui/skeleton'

export default function AdminMaterialsLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-56 mb-6" />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map(key => (
          <Skeleton key={key} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}
