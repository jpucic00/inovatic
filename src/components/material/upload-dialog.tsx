'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createMaterial } from '@/actions/material/crud'
import type { MaterialType } from '@prisma/client'
import { isAllowedExternalVideoUrl } from '@/lib/validators/material'
import { isRobocampUrl } from '@/lib/robocamp-proxy'
import { formatBytes } from '@/lib/material-display'

// ─── Props ──────────────────────────────────────────────────────────────────

type Target =
  | { scope: 'MODULE'; moduleId: string }
  | { scope: 'COURSE'; courseId: string }
  | { scope: 'GROUP'; scheduledGroupId: string }

interface UploadMaterialDialogProps {
  target: Target
  /** Optional custom trigger label (default: "Dodaj materijal"). */
  label?: string
  /** Optional short subtitle shown in the dialog header. */
  scopeLabel?: string
}

// ─── Implementation ─────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: MaterialType; label: string }[] = [
  { value: 'ROBOCAMP', label: 'RoboCamp' },
  { value: 'DOCUMENT', label: 'Dokument' },
  { value: 'PRESENTATION', label: 'Prezentacija' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'LINK', label: 'Poveznica' },
]

type UploadResponse = {
  url: string
  bytes: number
  mimeType: string
}

export function UploadMaterialDialog({ target, label, scopeLabel }: Readonly<UploadMaterialDialogProps>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<MaterialType>('DOCUMENT')
  const [videoMode, setVideoMode] = useState<'upload' | 'url'>('upload')
  const [externalUrl, setExternalUrl] = useState('')
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileBytes, setFileBytes] = useState<number | null>(null)
  const [fileMime, setFileMime] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const needsFileUpload = type === 'DOCUMENT' || type === 'PRESENTATION' || (type === 'VIDEO' && videoMode === 'upload')
  const needsExternalUrl = type === 'LINK' || type === 'ROBOCAMP' || (type === 'VIDEO' && videoMode === 'url')

  const canSubmit = (() => {
    if (title.trim().length < 2) return false
    if (needsFileUpload && !fileUrl) return false
    if (needsExternalUrl) {
      if (!externalUrl.trim()) return false
      if (type === 'VIDEO' && !isAllowedExternalVideoUrl(externalUrl.trim())) return false
      if (type === 'ROBOCAMP' && !isRobocampUrl(externalUrl.trim())) return false
    }
    return true
  })()

  const reset = () => {
    setTitle('')
    setDescription('')
    setType('DOCUMENT')
    setVideoMode('upload')
    setExternalUrl('')
    setFileUrl(null)
    setFileBytes(null)
    setFileMime(null)
    setFileName(null)
    setUploading(false)
  }

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
      setFileUrl(json.url)
      setFileBytes(json.bytes)
      setFileMime(json.mimeType)
      setFileName(file.name)
    } catch (err) {
      console.error(err)
      toast.error('Upload neuspješan.')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = () => {
    if (!canSubmit) return

    const common = {
      title: title.trim(),
      description: description.trim() || null,
      type,
      fileUrl: needsFileUpload ? fileUrl : null,
      externalUrl: needsExternalUrl ? externalUrl.trim() : null,
      fileSize: needsFileUpload ? fileBytes : null,
      mimeType: needsFileUpload ? fileMime : null,
      sortOrder: 0,
    }

    let input
    if (target.scope === 'MODULE') {
      input = { ...common, scope: 'MODULE' as const, moduleId: target.moduleId }
    } else if (target.scope === 'COURSE') {
      input = { ...common, scope: 'COURSE' as const, courseId: target.courseId }
    } else {
      input = { ...common, scope: 'GROUP' as const, scheduledGroupId: target.scheduledGroupId }
    }

    startTransition(async () => {
      const res = await createMaterial(input)
      if (res.success) {
        toast.success('Materijal dodan.')
        setOpen(false)
        reset()
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <Plus className="w-4 h-4" />
          {label ?? 'Dodaj materijal'}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj materijal</DialogTitle>
          <DialogDescription>
            {scopeLabel ?? 'Novi materijal će biti vidljiv odmah po spremanju.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Naslov" required>
            <input
              id="material-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="npr. Modul 1 – uvod u robotiku"
            />
          </Field>

          <Field label="Opis">
            <textarea
              id="material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Kratak opis (neobavezno)"
            />
          </Field>

          <Field label="Tip">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    'cursor-pointer rounded-md border px-3 py-2 text-sm text-center transition-colors',
                    type === opt.value
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="material-type"
                    value={opt.value}
                    checked={type === opt.value}
                    onChange={() => {
                      setType(opt.value)
                      setFileUrl(null)
                      setFileName(null)
                      setExternalUrl('')
                    }}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </Field>

          {type === 'VIDEO' && (
            <Field label="Izvor videa">
              <div className="flex gap-1 border-b border-gray-200 mb-3">
                {(['upload', 'url'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setVideoMode(m)
                      setFileUrl(null)
                      setFileName(null)
                      setExternalUrl('')
                    }}
                    className={[
                      'px-3 py-1.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors',
                      videoMode === m
                        ? 'border-cyan-600 text-cyan-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700',
                    ].join(' ')}
                  >
                    {m === 'upload' ? 'Uploadaj video' : 'Zalijepi poveznicu'}
                  </button>
                ))}
              </div>
              {videoMode === 'upload' ? (
                <FileInput uploading={uploading} fileName={fileName} fileBytes={fileBytes} onFile={handleFile} accept="video/mp4,video/webm,video/quicktime" />
              ) : (
                <input
                  id="material-external-url"
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              )}
            </Field>
          )}
          {type === 'LINK' && (
            <Field label="URL">
              <input
                id="material-external-url"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </Field>
          )}
          {type === 'ROBOCAMP' && (
            <Field label="RoboCamp poveznica">
              <input
                id="material-external-url"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://elearning.robocamp.eu/…"
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Interaktivni vodič — poveznica mora biti sa elearning.robocamp.eu.
              </p>
            </Field>
          )}
          {(type === 'DOCUMENT' || type === 'PRESENTATION') && (
            <Field label="Datoteka">
              <FileInput
                uploading={uploading}
                fileName={fileName}
                fileBytes={fileBytes}
                onFile={handleFile}
                accept={type === 'PRESENTATION'
                  ? 'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf'
                  : 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'}
              />
            </Field>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending || uploading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Spremi
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, required, children }: Readonly<{ label: string; required?: boolean; children: React.ReactNode }>) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  )
}

function FileInput({
  uploading,
  fileName,
  fileBytes,
  onFile,
  accept,
}: Readonly<{
  uploading: boolean
  fileName: string | null
  fileBytes: number | null
  onFile: (f: File) => void
  accept: string
}>) {
  return (
    <div>
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
        className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100"
      />
      {uploading && (
        <p className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Uploadam…
        </p>
      )}
      {!uploading && fileName && (
        <p className="mt-2 text-xs text-emerald-700">
          ✓ {fileName}
          {fileBytes == null ? '' : ` · ${formatBytes(fileBytes)}`}
        </p>
      )}
    </div>
  )
}
