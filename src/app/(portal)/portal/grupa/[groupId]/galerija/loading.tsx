import { Skeleton } from '@/components/ui/skeleton'

export default function PortalGroupGalerijaLoading() {
  return (
    <div>
      <Skeleton className="h-4 w-40 mb-4" />
      <Skeleton className="h-8 w-72 mb-2" />
      <Skeleton className="h-4 w-48 mb-6" />
      <div className="flex gap-2 border-b border-gray-200 mb-4">
        {Array.from({ length: 4 }, (_, i) => `tab-${i}`).map(key => (
          <Skeleton key={key} className="h-7 w-24" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 8 }, (_, i) => `img-${i}`).map(key => (
          <Skeleton key={key} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  )
}
