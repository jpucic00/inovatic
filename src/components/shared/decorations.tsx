const GEAR_INNER_RADIUS_RATIO = 0.55
const GEAR_TOOTH_WIDTH_RATIO = 0.18
const GEAR_TOOTH_HEIGHT_RATIO = 0.14
const GEAR_TOOTH_ROUNDING = 0.3
const STAR_INNER_RADIUS_RATIO = 0.38
const STAR_POINTS_COUNT = 10

export function GearDecor({ size, className }: Readonly<{ size: number; className?: string }>) {
  const r = size / 2
  const innerR = r * GEAR_INNER_RADIUS_RATIO
  const toothW = size * GEAR_TOOTH_WIDTH_RATIO
  const toothH = size * GEAR_TOOTH_HEIGHT_RATIO
  const cx = r
  const cy = r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className={className} aria-hidden="true">
      <circle cx={cx} cy={cy} r={innerR} fill="currentColor" />
      <rect x={cx - toothW / 2} y={0} width={toothW} height={toothH} rx={toothW * GEAR_TOOTH_ROUNDING} fill="currentColor" />
      <rect x={cx - toothW / 2} y={size - toothH} width={toothW} height={toothH} rx={toothW * GEAR_TOOTH_ROUNDING} fill="currentColor" />
      <rect x={0} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * GEAR_TOOTH_ROUNDING} fill="currentColor" />
      <rect x={size - toothH} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * GEAR_TOOTH_ROUNDING} fill="currentColor" />
    </svg>
  )
}

export function StarDecor({ size, className }: Readonly<{ size: number; className?: string }>) {
  const c = size / 2
  const r1 = size / 2
  const r2 = size * STAR_INNER_RADIUS_RATIO
  const points = Array.from({ length: STAR_POINTS_COUNT }, (_, i) => {
    const angle = (i * Math.PI) / 5 - Math.PI / 2
    const r = i % 2 === 0 ? r1 : r2
    return `${c + r * Math.cos(angle)},${c + r * Math.sin(angle)}`
  }).join(' ')
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="currentColor" className={className} aria-hidden="true">
      <polygon points={points} />
    </svg>
  )
}
