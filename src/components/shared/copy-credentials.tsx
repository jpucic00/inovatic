'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'

interface CopyCredentialsProps {
  username: string
  password: string
}

export function CopyCredentials({ username, password }: Readonly<CopyCredentialsProps>) {
  const handleCopy = () => {
    const text = `Korisničko ime: ${username}\nLozinka: ${password}`
    navigator.clipboard.writeText(text)
    toast.success('Podaci kopirani.')
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 transition-colors"
    >
      <Copy className="w-3.5 h-3.5" />
      Kopiraj podatke
    </button>
  )
}
