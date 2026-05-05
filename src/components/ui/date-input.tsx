'use client'

import { useState, useEffect, useRef } from 'react'
import { Calendar } from 'lucide-react'

interface DateInputProps {
  value: string
  onChange: (iso: string) => void
  className?: string
  disabled?: boolean
  id?: string
  placeholder?: string
}

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [yyyy, mm, dd] = iso.split('-')
  if (!yyyy || !mm || !dd) return ''
  return `${dd}.${mm}.${yyyy}`
}

function displayToIso(display: string): string {
  if (!display || display.length < 10) return ''
  const match = display.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return ''
  const [, dd, mm, yyyy] = match
  const day = parseInt(dd, 10)
  const month = parseInt(mm, 10)
  const year = parseInt(yyyy, 10)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return ''
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return `${yyyy}-${mm}-${dd}`
}

export function DateInput({
  value,
  onChange,
  className = '',
  disabled = false,
  id,
  placeholder = 'dd.MM.yyyy',
}: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorTargetRef = useRef<number | null>(null)
  const isFullWidth = /\bw-full\b/.test(className)

  useEffect(() => {
    setDisplay(isoToDisplay(value))
  }, [value])

  useEffect(() => {
    if (cursorTargetRef.current !== null && inputRef.current && document.activeElement === inputRef.current) {
      const pos = cursorTargetRef.current
      inputRef.current.setSelectionRange(pos, pos)
    }
    cursorTargetRef.current = null
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const cursorBefore = e.target.selectionStart ?? raw.length

    let cleaned = raw.replace(/[^\d.]/g, '').slice(0, 10)
    let cursorAfter = cursorBefore - (raw.length - cleaned.length)

    const isAppendingAtEnd =
      cleaned.length === display.length + 1 && cursorBefore === cleaned.length
    if (isAppendingAtEnd && /\d/.test(cleaned[cleaned.length - 1])) {
      if (cleaned.length === 3 && /^\d{3}$/.test(cleaned)) {
        cleaned = cleaned.slice(0, 2) + '.' + cleaned.slice(2)
        cursorAfter += 1
      } else if (cleaned.length === 6 && /^\d{2}\.\d{3}$/.test(cleaned)) {
        cleaned = cleaned.slice(0, 5) + '.' + cleaned.slice(5)
        cursorAfter += 1
      }
    }

    cursorTargetRef.current = cursorAfter
    setDisplay(cleaned)

    const iso = displayToIso(cleaned)
    if (iso) onChange(iso)
    else if (cleaned === '') onChange('')
  }

  const handleBlur = () => {
    if (display.length === 0) return
    if (display.length === 10) {
      const iso = displayToIso(display)
      if (!iso) setDisplay(isoToDisplay(value))
    } else {
      setDisplay(isoToDisplay(value))
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      e.preventDefault()
      setDisplay(isoToDisplay(text))
      onChange(text)
      return
    }
    const digits = text.replace(/\D/g, '')
    if (digits.length === 8) {
      e.preventDefault()
      const formatted = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
      setDisplay(formatted)
      const iso = displayToIso(formatted)
      if (iso) onChange(iso)
    }
  }

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value
    if (iso) {
      setDisplay(isoToDisplay(iso))
      onChange(iso)
    }
  }

  return (
    <div className={`relative ${isFullWidth ? 'block w-full' : 'inline-block'}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        className={`pr-8 ${className}`}
      />
      <Calendar className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      <input
        type="date"
        value={value}
        onChange={handlePickerChange}
        tabIndex={-1}
        disabled={disabled}
        aria-hidden="true"
        className="absolute right-0 top-0 bottom-0 w-7 opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  )
}
