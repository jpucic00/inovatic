'use client'

import { useTransition } from 'react'
import Image from 'next/image'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { GalleryImageRow } from '@/actions/teacher/gallery'
import { removeGalleryImage } from '@/actions/gallery/crud'

interface Props {
  images: GalleryImageRow[]
  canManage: boolean
  onOpen: (index: number) => void
  emptyLabel: string
}

export function GalleryGrid({
  images,
  canManage,
  onOpen,
  emptyLabel,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {images.map((img, idx) => (
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
              src={img.url}
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
  )
}
