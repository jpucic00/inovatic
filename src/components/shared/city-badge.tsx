import { MapPin } from 'lucide-react'
import type { City } from '@prisma/client'
import { CITY_LABELS } from '@/lib/city'
import { cn } from '@/lib/utils'

/**
 * Small city (tenant) pill — Split vs Šibenik. Rendered on public novosti
 * cards + article headers and on the admin article list so an article's city
 * reads at a glance. Neutral styling sits cleanly beside dates and tag pills;
 * pass `className` to adjust weight per context.
 */
export function CityBadge({ city, className }: Readonly<{ city: City; className?: string }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500',
        className,
      )}
    >
      <MapPin className="h-3 w-3" />
      {CITY_LABELS[city]}
    </span>
  )
}
