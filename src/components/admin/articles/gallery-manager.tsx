'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, X, ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  addGalleryImages,
  removeGalleryImage,
  reorderGalleryImage,
  type GalleryImage,
} from '@/actions/admin/article-gallery'

interface Props {
  articleId: string
  initialImages: GalleryImage[]
}

export function GalleryManager({
  articleId,
  initialImages,
}: Readonly<Props>) {
  const router = useRouter()
  const [images, setImages] = useState<GalleryImage[]>(
    [...initialImages].sort((a, b) => a.sortOrder - b.sortOrder),
  )
  const [dragOver, setDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Upload every dropped/selected file via /api/upload, then persist each
  // returned URL as an ArticleImage row. Uploads run in parallel; persist
  // is sequential so sortOrder stays predictable.
  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (arr.length === 0) {
      toast.error('Odaberi barem jednu sliku.')
      return
    }

    setIsUploading(true)
    try {
      const urls = await Promise.all(
        arr.map(async (file) => {
          const form = new FormData()
          form.append('file', file)
          const res = await fetch('/api/upload', { method: 'POST', body: form })
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string
            }
            throw new Error(body.error ?? `Upload failed (${res.status})`)
          }
          const data = (await res.json()) as { url: string }
          return data.url
        }),
      )

      const result = await addGalleryImages(articleId, urls)
      if (result.success && result.images) {
        setImages((prev) =>
          [...prev, ...result.images!].sort((a, b) => a.sortOrder - b.sortOrder),
        )
        toast.success(
          result.images.length === 1
            ? 'Slika dodana u galeriju.'
            : `${result.images.length} slika dodano u galeriju.`,
        )
        router.refresh()
      } else if (!result.success) {
        toast.error(result.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload neuspješan.')
    } finally {
      setIsUploading(false)
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) void handleFiles(files)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) void handleFiles(files)
  }

  const handleRemove = (image: GalleryImage) => {
    setPendingId(image.id)
    startTransition(async () => {
      const res = await removeGalleryImage(image.id)
      setPendingId(null)
      if (res.success) {
        setImages((prev) => prev.filter((i) => i.id !== image.id))
        toast.success('Slika uklonjena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleMove = (image: GalleryImage, direction: 'up' | 'down') => {
    const idx = images.findIndex((i) => i.id === image.id)
    if (idx === -1) return
    const neighborIdx = direction === 'up' ? idx - 1 : idx + 1
    if (neighborIdx < 0 || neighborIdx >= images.length) return

    // Optimistic swap
    const next = [...images]
    const tmpOrder = next[idx].sortOrder
    next[idx] = { ...next[idx], sortOrder: next[neighborIdx].sortOrder }
    next[neighborIdx] = { ...next[neighborIdx], sortOrder: tmpOrder }
    next.sort((a, b) => a.sortOrder - b.sortOrder)
    setImages(next)

    setPendingId(image.id)
    startTransition(async () => {
      const res = await reorderGalleryImage(image.id, direction)
      setPendingId(null)
      if (!res.success) {
        toast.error(res.error)
        // Revert
        setImages(
          [...initialImages].sort((a, b) => a.sortOrder - b.sortOrder),
        )
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="gallery-input"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'flex flex-col items-center justify-center gap-2 w-full h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
          dragOver
            ? 'border-cyan-500 bg-cyan-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400',
          isUploading && 'opacity-50 pointer-events-none',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isUploading ? (
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        ) : (
          <ImagePlus className="w-6 h-6 text-gray-400" />
        )}
        <span className="text-sm text-gray-600">
          {isUploading
            ? 'Prenosim slike...'
            : 'Klikni ili povuci slike (može i više odjednom)'}
        </span>
        <input
          id="gallery-input"
          type="file"
          accept="image/*"
          multiple
          onChange={onInputChange}
          className="hidden"
          disabled={isUploading}
        />
      </label>

      {images.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Galerija je prazna.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {images.map((img, idx) => {
            const isFirst = idx === 0
            const isLast = idx === images.length - 1
            const isBusy = pendingId === img.id
            return (
              <div
                key={img.id}
                className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
              >
                <Image
                  src={img.url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 33vw, 20vw"
                  unoptimized
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                <div className="absolute inset-x-1 bottom-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleMove(img, 'up')}
                      disabled={isFirst || isBusy}
                      aria-label="Pomakni gore"
                      className="p-1 bg-white/90 hover:bg-white rounded shadow-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(img, 'down')}
                      disabled={isLast || isBusy}
                      aria-label="Pomakni dolje"
                      className="p-1 bg-white/90 hover:bg-white rounded shadow-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(img)}
                    disabled={isBusy}
                    aria-label="Ukloni sliku"
                    className="p-1 bg-white/90 hover:bg-red-50 rounded shadow-sm text-red-600 disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
