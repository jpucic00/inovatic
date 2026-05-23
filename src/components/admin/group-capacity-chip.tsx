interface Props {
  availableSpots: number
  isFull: boolean
}

export function GroupCapacityChip({ availableSpots, isFull }: Readonly<Props>) {
  let text: string
  let className: string
  if (isFull) {
    text = 'Popunjeno'
    className = 'bg-red-50 text-red-700 border-red-200'
  } else if (availableSpots <= 2) {
    text =
      availableSpots === 1
        ? 'Još 1 slobodno mjesto'
        : `Još ${availableSpots} slobodna mjesta`
    className = 'bg-amber-50 text-amber-700 border-amber-200'
  } else {
    text = `${availableSpots} slobodnih mjesta`
    className = 'bg-green-50 text-green-700 border-green-200'
  }
  return (
    <span
      className={`text-[10px] font-medium rounded px-1.5 py-0.5 border whitespace-nowrap ${className}`}
    >
      {text}
    </span>
  )
}
