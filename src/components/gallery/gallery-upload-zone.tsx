'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { addGalleryImages } from '@/actions/gallery/crud'

interface Props {
  scheduledGroupId: string
  moduleId: string | null
}

interface UploadResult {
  url: string
  publicId: string
  width?: number | null
  height?: number | null
}

export function GalleryUploadZone({
  scheduledGroupId,
  moduleId,
}: Readonly<Props>) {
  const router = useRouter()
  const [dragOver, setDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (arr.length === 0) {
      toast.error('Odaberite barem jednu sliku.')
      return
    }

    setIsUploading(true)
    try {
      const uploads = await Promise.all(
        arr.map(async (file): Promise<UploadResult | null> => {
          const form = new FormData()
          form.append('file', file)
          const res = await fetch('/api/upload/gallery', {
            method: 'POST',
            body: form,
          })
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string
            }
            if (res.status === 415) {
              toast.error(
                'Nepodržan format. Dozvoljeno: JPG, PNG, WEBP, GIF.',
              )
            } else if (res.status === 413) {
              toast.error('Slika je prevelika (max 10 MB).')
            } else {
              toast.error(body.error ?? `Upload neuspješan (${res.status}).`)
            }
            return null
          }
          return (await res.json()) as UploadResult
        }),
      )

      const successful = uploads.filter((u): u is UploadResult => u !== null)
      if (successful.length === 0) return

      const result = await addGalleryImages({
        scheduledGroupId,
        moduleId,
        images: successful.map((u) => ({
          url: u.url,
          publicId: u.publicId,
          width: u.width ?? null,
          height: u.height ?? null,
        })),
      })

      if (result.success) {
        toast.success(
          successful.length === 1
            ? 'Slika dodana u galeriju.'
            : `${successful.length} slika dodano u galeriju.`,
        )
        router.refresh()
      } else {
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

  const inputId = `gallery-upload-${scheduledGroupId}-${moduleId ?? 'all'}`

  return (
    <label
      htmlFor={inputId}
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
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={onInputChange}
        className="hidden"
        disabled={isUploading}
      />
    </label>
  )
}
