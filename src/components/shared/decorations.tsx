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

export function ConfettiDecor({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 1280 600"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <circle cx="1050" cy="90" r="7" fill="#facc15" opacity="0.9" />
      <circle cx="1180" cy="200" r="5" fill="#4ade80" opacity="0.85" />
      <circle cx="920" cy="60" r="4" fill="#f87171" opacity="0.85" />
      <circle cx="1230" cy="420" r="6" fill="#a78bfa" opacity="0.8" />
      <circle cx="860" cy="520" r="5" fill="#facc15" opacity="0.7" />
      <rect x="990" y="300" width="12" height="12" rx="3" fill="#4BBDCA" transform="rotate(24 996 306)" opacity="0.9" />
      <rect x="1120" y="120" width="10" height="10" rx="2" fill="#f87171" transform="rotate(-18 1125 125)" opacity="0.85" />
      <rect x="1210" y="520" width="11" height="11" rx="2" fill="#4ade80" transform="rotate(30 1215 525)" opacity="0.8" />
      <rect x="890" y="180" width="9" height="9" rx="2" fill="#a78bfa" transform="rotate(12 894 184)" opacity="0.8" />
      <path d="M 1060 480 q 8 -14 16 0 q 8 14 16 0" stroke="#facc15" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M 940 400 q 7 -12 14 0 q 7 12 14 0" stroke="#4BBDCA" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
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
