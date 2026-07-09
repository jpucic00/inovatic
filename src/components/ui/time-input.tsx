'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface TimeInputProps {
  /** Canonical 24h "HH:MM" or '' when empty/incomplete. */
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  id?: string
  placeholder?: string
}

const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Format up to 4 raw digits as a partial/complete "HH:MM" display string.
 * Hours are zero-padded (type "0930" for 09:30) — matches how the native time
 * field and most masked inputs behave.
 */
function formatDigits(digits: string): string {
  const d = digits.slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`
}

/**
 * Masked time field: the admin types 4 digits and it auto-inserts the colon
 * (→ "17:00"), with a numeric keypad on mobile (`inputMode="numeric"`). Emits
 * the canonical "HH:MM" only when the value is a real 24h time, otherwise ''.
 * Same controlled-input contract as `DateInput`, so callers wire it the same
 * way.
 */
export function TimeInput({
  value,
  onChange,
  className = '',
  disabled = false,
  id,
  placeholder = 'HH:MM',
}: Readonly<TimeInputProps>) {
  const [display, setDisplay] = useState(() => value)

  useEffect(() => {
    setDisplay(value)
  }, [value])

  const commit = (rawDigits: string) => {
    const next = formatDigits(rawDigits)
    setDisplay(next)
    onChange(VALID_TIME.test(next) ? next : '')
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    commit(e.target.value.replaceAll(/\D/g, ''))
  }

  const handleBlur = () => {
    // Snap back to the last canonical value if the text isn't a full time
    // (e.g. left as "17:" or "9").
    if (!VALID_TIME.test(display)) setDisplay(value)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replaceAll(/\D/g, '')
    if (digits.length >= 3) {
      e.preventDefault()
      commit(digits)
    }
  }

  const isFullWidth = /\bw-full\b/.test(className)

  return (
    <div className={`relative ${isFullWidth ? 'block w-full' : 'inline-block'}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={5}
        className={`pr-8 ${className}`}
      />
      <Clock className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
    </div>
  )
}
