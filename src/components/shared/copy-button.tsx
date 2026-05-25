'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'

interface CopyButtonProps {
  value: string
  /** Used in aria-label and hover title, e.g. "e-mail" → "Kopiraj e-mail". */
  label?: string
}

export function CopyButton({ value, label }: Readonly<CopyButtonProps>) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Kopirano u međuspremnik.')
    } catch {
      toast.error('Kopiranje nije uspjelo.')
    }
  }

  const title = label ? `Kopiraj ${label}` : 'Kopiraj'

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={title}
      title={title}
      className="inline-flex items-center justify-center p-1 text-gray-400 hover:text-cyan-700 hover:bg-cyan-50 rounded transition-colors"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  )
}
