import { availableSpotsTone, formatAvailableSpots } from '@/lib/available-spots'

interface Props {
  availableSpots: number
  isFull: boolean
}

const TONE_CLASS = {
  full: 'bg-red-50 text-red-700 border-red-200',
  low: 'bg-amber-50 text-amber-700 border-amber-200',
  open: 'bg-green-50 text-green-700 border-green-200',
} as const

export function GroupCapacityChip({ availableSpots, isFull }: Readonly<Props>) {
  const spots = isFull ? 0 : availableSpots
  return (
    <span
      className={`text-[10px] font-medium rounded px-1.5 py-0.5 border whitespace-nowrap ${TONE_CLASS[availableSpotsTone(spots)]}`}
    >
      {formatAvailableSpots(spots)}
    </span>
  )
}
