import { Skeleton } from '@/components/ui/skeleton'

export default function AdminStudentLoading() {
  return (
    <div className="max-w-3xl">
      <Skeleton className="h-4 w-40 mb-6" />
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-3 w-40 mb-8" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border p-6 mb-6 space-y-3"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}
