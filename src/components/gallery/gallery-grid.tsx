'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { GalleryImageRow } from '@/actions/teacher/gallery'
import { removeGalleryImage } from '@/actions/gallery/crud'
import { cloudinaryThumbUrl } from '@/lib/cloudinary-url'

interface Props {
  images: GalleryImageRow[]
  canManage: boolean
  onOpen: (index: number) => void
  emptyLabel: string
}

const PAGE_SIZE = 12

export function GalleryGrid({
  images,
  canManage,
  onOpen,
  emptyLabel,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(PAGE_SIZE, images.length),
  )

  // Reset the visible window whenever the source list changes (e.g. switching
  // module tabs, after upload/delete). Otherwise the previous count would
  // bleed across views and hide newer images.
  useEffect(() => {
    setVisibleCount(Math.min(PAGE_SIZE, images.length))
  }, [images])

  if (images.length === 0) {
    return <p className="text-sm text-gray-500 italic">{emptyLabel}</p>
  }

  const handleRemove = (image: GalleryImageRow) => {
    if (
      !confirm('Obrisati ovu sliku? Ova radnja je nepovratna.')
    ) {
      return
    }
    startTransition(async () => {
      const res = await removeGalleryImage(image.id)
      if (res.success) {
        toast.success('Slika obrisana.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {images.slice(0, visibleCount).map((img, idx) => (
          <div
            key={img.id}
            className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
          >
            <button
              type="button"
              onClick={() => onOpen(idx)}
              aria-label="Otvori sliku"
              className="absolute inset-0 cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <Image
                src={cloudinaryThumbUrl(img.url, 400, 400)}
                alt={img.caption ?? ''}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                unoptimized
              />
            </button>
            <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            {canManage && (
              <button
                type="button"
                onClick={() => handleRemove(img)}
                disabled={isPending}
                aria-label="Obriši sliku"
                className="absolute top-1 right-1 p-1.5 bg-white/90 hover:bg-red-50 rounded shadow-sm text-red-600 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {visibleCount < images.length && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-500">
            Prikazano {visibleCount} od {images.length} slika
          </p>
          <button
            type="button"
            onClick={() =>
              setVisibleCount((c) => Math.min(c + PAGE_SIZE, images.length))
            }
            className="px-4 py-2 text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-colors"
          >
            Prikaži još {Math.min(PAGE_SIZE, images.length - visibleCount)} slika
          </button>
        </div>
      )}
    </div>
  )
}
