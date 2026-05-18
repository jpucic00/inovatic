'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateMaterial } from '@/actions/material/crud'
import type { MaterialType } from '@prisma/client'
import { formatBytes } from './material-type-badge'

interface Props {
  id: string
  title: string
  description: string | null
  sortOrder: number
  type: MaterialType
  fileUrl: string | null
  fileSize: number | null
}

type UploadResponse = {
  url: string
  bytes: number
  mimeType: string
}

const PRESENTATION_ACCEPT =
  'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf'
const DOCUMENT_ACCEPT =
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime'

function acceptForType(type: MaterialType): string {
  if (type === 'PRESENTATION') return PRESENTATION_ACCEPT
  if (type === 'VIDEO') return VIDEO_ACCEPT
  return DOCUMENT_ACCEPT
}

function fileNameFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').findLast(Boolean)
    return last ?? null
  } catch {
    return null
  }
}

export function EditMaterialDialog({
  id,
  title: initialTitle,
  description: initialDescription,
  sortOrder: initialSortOrder,
  type,
  fileUrl,
  fileSize,
}: Readonly<Props>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [sortOrder, setSortOrder] = useState(initialSortOrder)
  const [isPending, startTransition] = useTransition()

  // File replacement state. Only relevant when the material has an existing file
  // (i.e. type !== 'LINK' and fileUrl is set). When the user picks a new file we
  // upload it eagerly to /api/upload/materials so the server action only carries
  // the resulting URL.
  const [newFileUrl, setNewFileUrl] = useState<string | null>(null)
  const [newFileBytes, setNewFileBytes] = useState<number | null>(null)
  const [newFileMime, setNewFileMime] = useState<string | null>(null)
  const [newFileName, setNewFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const showFileReplace = type !== 'LINK' && Boolean(fileUrl)
  const canSubmit = title.trim().length >= 2 && !uploading

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload/materials', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Upload neuspješan.')
        return
      }
      const json = (await res.json()) as UploadResponse
      setNewFileUrl(json.url)
      setNewFileBytes(json.bytes)
      setNewFileMime(json.mimeType)
      setNewFileName(file.name)
    } catch (err) {
      console.error(err)
      toast.error('Upload neuspješan.')
    } finally {
      setUploading(false)
    }
  }

  const resetFileState = () => {
    setNewFileUrl(null)
    setNewFileBytes(null)
    setNewFileMime(null)
    setNewFileName(null)
    setUploading(false)
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    startTransition(async () => {
      const res = await updateMaterial({
        id,
        title: title.trim(),
        description: description.trim() || null,
        sortOrder,
        ...(newFileUrl
          ? {
              fileUrl: newFileUrl,
              fileSize: newFileBytes ?? undefined,
              mimeType: newFileMime ?? undefined,
            }
          : {}),
      })
      if (res.success) {
        toast.success('Spremljeno.')
        setOpen(false)
        resetFileState()
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const currentName = fileNameFromUrl(fileUrl)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) resetFileState()
      }}
    >
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-cyan-700 rounded hover:bg-gray-50 transition-colors"
          aria-label="Uredi materijal"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Uredi materijal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-material-title" className="block text-sm font-medium text-gray-700 mb-1.5">Naslov</label>
            <input
              id="edit-material-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label htmlFor="edit-material-description" className="block text-sm font-medium text-gray-700 mb-1.5">Opis</label>
            <textarea
              id="edit-material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          {showFileReplace ? (
            <div>
              <label htmlFor="edit-material-file" className="block text-sm font-medium text-gray-700 mb-1.5">
                Zamijeni datoteku
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Trenutna: {currentName ?? '—'}
                {fileSize ? ` · ${formatBytes(fileSize)}` : ''}
              </p>
              <input
                id="edit-material-file"
                type="file"
                accept={acceptForType(type)}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
                className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100"
              />
              {uploading ? (
                <p className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploadam…
                </p>
              ) : null}
              {!uploading && newFileName ? (
                <p className="mt-2 text-xs text-emerald-700">
                  ✓ {newFileName}
                  {newFileBytes == null ? '' : ` · ${formatBytes(newFileBytes)}`}
                </p>
              ) : null}
            </div>
          ) : null}
          <div>
            <label htmlFor="edit-material-sort-order" className="block text-sm font-medium text-gray-700 mb-1.5">Redoslijed</label>
            <input
              id="edit-material-sort-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number.parseInt(e.target.value, 10) || 0)}
              className="w-32 px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Spremi
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
