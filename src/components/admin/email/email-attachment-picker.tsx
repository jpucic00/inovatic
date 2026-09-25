'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  attachmentSetError,
  formatMegabytes,
} from '@/lib/email-attachment-rules'
import { formatBytes } from '@/lib/material-display'
import { deleteDraftEmailAttachment } from '@/actions/admin/email-attachment'

export type DraftAttachment = {
  id: string
  filename: string
  bytes: number
  mimeType: string
}

type UploadResponse = DraftAttachment | { error: string }

async function uploadOne(file: File): Promise<DraftAttachment> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload/email-attachment', { method: 'POST', body: form })
  const json = (await res.json().catch(() => null)) as UploadResponse | null
  if (!res.ok || !json || 'error' in json) {
    throw new Error(json && 'error' in json ? json.error : 'Učitavanje nije uspjelo.')
  }
  return json
}

/**
 * The composer's attachments. Files go up one by one the moment they are picked
 * (a server action could not carry them — its body is capped at 1 MB), so what
 * the wizard holds is draft ids; the send links them to the campaign.
 *
 * The same limits the server enforces are checked here first, so an admin is
 * told before uploading rather than after composing everything else.
 *
 * `reservedFile` holds one slot for a file the server adds itself (the
 * SCHOOL_CALENDAR PDF counts toward the same set). Its size is not known until
 * the send renders it, so only the slot is counted here; the server still has
 * the last word on the total.
 */
export function EmailAttachmentPicker({
  attachments,
  onChange,
  onUploadingChange,
  reservedFile,
}: Readonly<{
  attachments: DraftAttachment[]
  onChange: (next: DraftAttachment[]) => void
  onUploadingChange: (uploading: boolean) => void
  reservedFile?: { note: string }
}>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string[]>([])
  const total = attachments.reduce((sum, a) => sum + a.bytes, 0)
  const reserved = reservedFile ? [{ bytes: 0 }] : []

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const picked = Array.from(list)
    const error = attachmentSetError([
      ...reserved,
      ...attachments,
      ...picked.map((f) => ({ bytes: f.size })),
    ])
    if (error) {
      toast.error(error)
      return
    }

    setUploading(picked.map((f) => f.name))
    onUploadingChange(true)
    // Sequential, and each success is kept even if a later file fails — an
    // admin who picked three files should not have to re-pick the two that
    // went through.
    let next = attachments
    for (const file of picked) {
      try {
        const uploaded = await uploadOne(file)
        next = [...next, uploaded]
        onChange(next)
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'Učitavanje nije uspjelo.'}`)
      }
      setUploading((names) => names.filter((n) => n !== file.name))
    }
    onUploadingChange(false)
  }

  const handleRemove = (id: string) => {
    onChange(attachments.filter((a) => a.id !== id))
    // The draft is gone from the composer either way; a failed delete only
    // leaves it for the 24-hour sweep.
    deleteDraftEmailAttachment(id).catch(() => {})
  }

  const full = attachments.length + reserved.length >= MAX_ATTACHMENTS

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 block p-0 text-sm font-medium text-gray-700">Privici</legend>

      {attachments.length > 0 && (
        <ul className="mb-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-gray-800" title={a.filename}>
                {a.filename}
              </span>
              <span className="shrink-0 text-xs text-gray-500">
                {ATTACHMENT_TYPES[a.mimeType] ?? ''} · {formatBytes(a.bytes)}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(a.id)}
                // The upload loop appends to the list it started from, so a
                // removal mid-upload would be undone by its next step.
                disabled={uploading.length > 0}
                aria-label={`Ukloni privitak ${a.filename}`}
                className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploading.length > 0 && (
        <output className="mb-2 inline-flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Učitavam: {uploading.join(', ')}
        </output>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files)
            // Reset so picking the same file again (after removing it) fires.
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={full || uploading.length > 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" />
          Dodaj privitak
        </button>
        <span className="text-xs text-gray-500">
          PDF, Word, Excel, JPG ili PNG · do {formatMegabytes(MAX_ATTACHMENT_BYTES)} po datoteci ·{' '}
          {attachments.length > 0
            ? `ukupno ${formatBytes(total) ?? '0 B'} od ${formatMegabytes(MAX_TOTAL_ATTACHMENT_BYTES)}`
            : `najviše ${MAX_ATTACHMENTS} datoteka, ukupno ${formatMegabytes(MAX_TOTAL_ATTACHMENT_BYTES)}`}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        Svi primatelji dobivaju iste privitke.
        {reservedFile && ` ${reservedFile.note}`}
      </p>
    </fieldset>
  )
}
