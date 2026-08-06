'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * Copies an absolute link to the clipboard — the signup or radionica URL an
 * admin sends to parents. Takes a site-relative `path` so the same button
 * serves `/prijava/<slug>` and `/radionice/<slug>`; the origin comes from the
 * browser, so it is correct on localhost, staging and production alike.
 */
export function CopyLinkButton({
  path,
  label = 'Kopiraj URL za upise',
  title = 'Kopiraj URL za upise',
}: Readonly<{ path: string; label?: string; title?: string }>) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard
      .writeText(`${globalThis.location.origin}${path}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Clipboard access can be denied (insecure origin, permission prompt).
        // Silently keeping the un-copied state is honest: nothing was copied.
      })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Kopirano' : label}
    </button>
  )
}
