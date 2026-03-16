export function GearDecor({ size, className }: { size: number; className?: string }) {
  const r = size / 2
  const innerR = r * 0.55
  const toothW = size * 0.18
  const toothH = size * 0.14
  const cx = r
  const cy = r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className={className} aria-hidden="true">
      <circle cx={cx} cy={cy} r={innerR} fill="currentColor" />
      <rect x={cx - toothW / 2} y={0} width={toothW} height={toothH} rx={toothW * 0.3} fill="currentColor" />
      <rect x={cx - toothW / 2} y={size - toothH} width={toothW} height={toothH} rx={toothW * 0.3} fill="currentColor" />
      <rect x={0} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * 0.3} fill="currentColor" />
      <rect x={size - toothH} y={cy - toothW / 2} width={toothH} height={toothW} rx={toothW * 0.3} fill="currentColor" />
    </svg>
  )
}

export function StarDecor({ size, className }: { size: number; className?: string }) {
  const c = size / 2
  const r1 = size / 2
  const r2 = size * 0.38
  const points = Array.from({ length: 10 }, (_, i) => {
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
