'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { addGalleryImages } from '@/actions/gallery/crud'
import { postFileWithProgress } from '@/components/shared/post-file-with-progress'
import { UploadProgressOverlay } from '@/components/shared/upload-progress-overlay'
import { croatianPlural } from '@/lib/format'
import {
  GALLERY_ACCEPT,
  galleryFileError,
  galleryUploadErrorMessage,
} from '@/lib/gallery-upload-rules'

interface Props {
  scheduledGroupId: string
  moduleId: string | null
  /** Told when an upload starts and ends, so the page can hold still meanwhile. */
  onBusyChange?: (busy: boolean) => void
}

interface UploadResult {
  url: string
  publicId: string
  width?: number | null
  height?: number | null
}

/** A picked image — still only in the browser until "Dodaj u galeriju". */
interface StagedImage {
  key: string
  file: File
  previewUrl: string
  error: string | null
}

type Busy = { step: 'upload'; done: number; total: number; progress: number } | { step: 'save' } | null

/** One save holds at most this many images (`addGalleryImagesSchema`). */
const MAX_STAGED = 50
/** Uploads in flight at once: enough to keep the line busy, not a flood on classroom Wi-Fi. */
const PARALLEL = 3
const SAVE_FAILED = 'Spremanje nije uspjelo. Provjerite vezu i pokušajte ponovno.'

let stagedCounter = 0

/**
 * Picked or dropped images are only staged (thumbnails, removable); nothing
 * reaches Cloudinary until "Dodaj u galeriju". Then every image uploads behind
 * one progress overlay and they are saved together. Uploading on drop left
 * Cloudinary files behind whenever the save failed or the page was left
 * mid-way; now a failed image is marked and a retry re-sends only what has not
 * gone through yet, and leaving the page while it runs asks first. Images that
 * did upload before a failure are still left behind if the batch is then
 * abandoned (Odustani, ×, leaving) — accepted, there is no discard.
 */
export function GalleryUploadZone({ scheduledGroupId, moduleId, onBusyChange }: Readonly<Props>) {
  const router = useRouter()
  const [dragOver, setDragOver] = useState(false)
  const [staged, setStaged] = useState<StagedImage[]>([])
  const [busy, setBusy] = useState<Busy>(null)
  // Uploads that went through, by file: a retry after a failed image or a
  // failed save sends only what is still missing.
  const uploadedRef = useRef(new Map<File, UploadResult>())
  const previewUrls = useRef(new Set<string>())

  const isBusy = busy !== null

  useEffect(() => {
    onBusyChange?.(isBusy)
    if (!isBusy) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    globalThis.addEventListener('beforeunload', warn)
    return () => globalThis.removeEventListener('beforeunload', warn)
  }, [isBusy, onBusyChange])

  // Previews are object URLs; release them with the component.
  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  const release = (items: StagedImage[]) => {
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl)
      previewUrls.current.delete(item.previewUrl)
      uploadedRef.current.delete(item.file)
    }
  }

  const stage = (files: FileList | File[]) => {
    const refused: string[] = []
    const accepted: StagedImage[] = []
    for (const file of Array.from(files)) {
      const error = galleryFileError(file)
      if (error) {
        refused.push(`${file.name} (${error})`)
        continue
      }
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.add(previewUrl)
      accepted.push({ key: `img-${++stagedCounter}`, file, previewUrl, error: null })
    }
    if (refused.length > 0) toast.error(`Preskočeno: ${refused.join(', ')}`)
    const room = Math.max(MAX_STAGED - staged.length, 0)
    if (accepted.length > room) {
      release(accepted.slice(room))
      toast.error(`Najviše ${MAX_STAGED} slika odjednom — ostale dodajte nakon spremanja.`)
    }
    setStaged([...staged, ...accepted.slice(0, room)])
  }

  const remove = (key: string) => {
    release(staged.filter((item) => item.key === key))
    setStaged(staged.filter((item) => item.key !== key))
  }

  const clear = () => {
    release(staged)
    setStaged([])
  }

  const uploadAll = async (items: StagedImage[]): Promise<boolean> => {
    const pending = items.filter((item) => !uploadedRef.current.has(item.file))
    const totalBytes = pending.reduce((sum, item) => sum + item.file.size, 0) || 1
    const loaded = new Map<string, number>()
    let done = 0
    const report = () => {
      const bytes = [...loaded.values()].reduce((sum, n) => sum + n, 0)
      setBusy({ step: 'upload', done, total: pending.length, progress: Math.min(bytes / totalBytes, 1) })
    }
    report()

    const errors = new Map<string, string>()
    const queue = [...pending]
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const current = item
        const body = new FormData()
        body.append('file', current.file)
        const res = await postFileWithProgress<UploadResult>('/api/upload/gallery', body, (fraction) => {
          loaded.set(current.key, fraction * current.file.size)
          report()
        })
        if (res.ok) uploadedRef.current.set(current.file, res.data)
        else errors.set(current.key, galleryUploadErrorMessage(res.status))
        loaded.set(current.key, current.file.size)
        done += 1
        report()
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, pending.length) }, worker))

    setStaged((prev) => prev.map((item) => ({ ...item, error: errors.get(item.key) ?? null })))
    if (errors.size > 0) {
      toast.error(
        `${errors.size} ${croatianPlural(errors.size, 'slika nije prenesena', 'slike nisu prenesene', 'slika nije preneseno')} — pokušajte ponovno ili ih uklonite.`,
      )
      return false
    }
    return true
  }

  const submit = async () => {
    if (staged.length === 0 || isBusy) return
    const items = staged
    const allUploaded = await uploadAll(items)
    if (!allUploaded) {
      setBusy(null)
      return
    }

    setBusy({ step: 'save' })
    const result = await addGalleryImages({
      scheduledGroupId,
      moduleId,
      images: items.map((item) => {
        const u = uploadedRef.current.get(item.file)!
        return { url: u.url, publicId: u.publicId, width: u.width ?? null, height: u.height ?? null }
      }),
    }).catch(() => ({ success: false as const, error: SAVE_FAILED }))
    setBusy(null)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(
      items.length === 1 ? 'Slika dodana u galeriju.' : `${items.length} slika dodano u galeriju.`,
    )
    release(items)
    setStaged([])
    router.refresh()
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) stage(files)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (isBusy) return
    const files = e.dataTransfer.files
    if (files && files.length > 0) stage(files)
  }

  const inputId = `gallery-upload-${scheduledGroupId}-${moduleId ?? 'all'}`
  const failed = staged.filter((item) => item.error !== null).length

  let overlayLabel = 'Spremam slike…'
  if (busy?.step === 'upload') overlayLabel = `Prenosim slike… ${busy.done} / ${busy.total} ·`

  return (
    <div className="relative space-y-3">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors',
          dragOver ? 'border-cyan-500 bg-cyan-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400',
        ].join(' ')}
      >
        <ImagePlus className="h-6 w-6 text-gray-400" aria-hidden />
        <span className="text-sm text-gray-600">Klikni ili povuci slike (može i više odjednom)</span>
        <input
          id={inputId}
          type="file"
          accept={GALLERY_ACCEPT}
          multiple
          onChange={onInputChange}
          className="hidden"
          disabled={isBusy}
        />
      </label>

      {staged.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {staged.map((item) => (
              <li key={item.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local object-URL preview, not a served image */}
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className={[
                    'aspect-square w-full rounded-md object-cover',
                    item.error ? 'ring-2 ring-red-500' : '',
                  ].join(' ')}
                />
                <button
                  type="button"
                  onClick={() => remove(item.key)}
                  disabled={isBusy}
                  aria-label={`Ukloni ${item.file.name}`}
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                {item.error ? (
                  <p className="mt-1 text-[11px] leading-tight text-red-600">{item.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-xs text-gray-500">
              {failed > 0
                ? `${failed} ${croatianPlural(failed, 'slika nije prenesena', 'slike nisu prenesene', 'slika nije preneseno')}.`
                : 'Slike se prenose kad kliknete „Dodaj u galeriju".'}
            </p>
            <button
              type="button"
              onClick={clear}
              disabled={isBusy}
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:border-gray-300 sm:min-h-10"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={isBusy}
              className="inline-flex min-h-11 items-center rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60 sm:min-h-10"
            >
              Dodaj u galeriju ({staged.length})
            </button>
          </div>
        </div>
      ) : null}

      {busy ? (
        <UploadProgressOverlay
          label={overlayLabel}
          progress={busy.step === 'upload' ? busy.progress : null}
          hint="Ne napuštajte stranicu dok se slike ne spreme."
        />
      ) : null}
    </div>
  )
}
