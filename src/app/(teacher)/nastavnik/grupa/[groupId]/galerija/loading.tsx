import { Skeleton } from '@/components/ui/skeleton'

export default function TeacherGroupGalerijaLoading() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200">
        {Array.from({ length: 4 }, (_, i) => `tab-${i}`).map(key => (
          <Skeleton key={key} className="h-7 w-24" />
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 8 }, (_, i) => `img-${i}`).map(key => (
          <Skeleton key={key} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  )
}
