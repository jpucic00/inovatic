import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number | string
  description?: string
  icon?: LucideIcon
  color?: 'cyan' | 'blue' | 'green' | 'amber' | 'red' | 'gray'
}

const colorMap: Record<NonNullable<StatCardProps['color']>, string> = {
  cyan: 'bg-cyan-50 text-cyan-800 border-cyan-100',
  blue: 'bg-blue-50 text-blue-800 border-blue-100',
  green: 'bg-green-50 text-green-800 border-green-100',
  amber: 'bg-amber-50 text-amber-800 border-amber-100',
  red: 'bg-red-50 text-red-800 border-red-100',
  gray: 'bg-gray-50 text-gray-800 border-gray-100',
}

export function StatCard({
  label,
  value,
  description,
  icon: Icon,
  color = 'gray',
}: Readonly<StatCardProps>) {
  return (
    <div className={cn('rounded-xl border p-5', colorMap[color])}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium opacity-75">{label}</p>
        {Icon && <Icon className="w-5 h-5 opacity-50" />}
      </div>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      {description && <p className="text-xs mt-1 opacity-60">{description}</p>}
    </div>
  )
}
