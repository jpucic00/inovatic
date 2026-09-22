'use client'

import { STAFF_ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/lib/session-staff'

/**
 * Predavač / Asistent, read and picked. Kept free of server actions so any
 * panel can render a role without pulling an action module along.
 */
export function RoleBadge({ role }: Readonly<{ role: StaffRole }>) {
  return (
    <span
      className={
        role === 'ASSISTANT'
          ? 'rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700'
          : 'rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-700'
      }
    >
      {STAFF_ROLE_LABELS[role]}
    </span>
  )
}

export function RoleSelect({
  id,
  value,
  onChange,
  disabled,
  ariaLabel,
  compact = false,
}: Readonly<{
  id?: string
  value: StaffRole
  onChange: (role: StaffRole) => void
  disabled?: boolean
  ariaLabel?: string
  compact?: boolean
}>) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as StaffRole)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={
        compact
          ? 'px-2 py-1 text-xs rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50'
          : 'w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50'
      }
    >
      {STAFF_ROLES.map((r) => (
        <option key={r} value={r}>
          {STAFF_ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  )
}
