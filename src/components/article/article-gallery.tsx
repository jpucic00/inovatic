'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { cloudinaryThumbUrl } from '@/lib/cloudinary-url'

interface GalleryImage {
  id: string
  url: string
  caption: string | null
}

interface Props {
  images: GalleryImage[]
  articleTitle: string
}

const PAGE_SIZE = 12

export function ArticleGallery({ images, articleTitle }: Readonly<Props>) {
  const [index, setIndex] = useState(-1)
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(PAGE_SIZE, images.length),
  )

  const slides = images.map((img) => ({
    src: img.url,
    alt: img.caption ?? articleTitle,
    ...(img.caption ? { description: img.caption } : {}),
  }))

  const open = useCallback((i: number) => setIndex(i), [])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.slice(0, visibleCount).map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => open(i)}
            className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 block w-full cursor-zoom-in"
          >
            <Image
              src={cloudinaryThumbUrl(img.url, 400, 400)}
              alt={img.caption ?? articleTitle}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, 33vw"
              unoptimized
            />
            {img.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-xs px-2 py-1.5 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                {img.caption}
              </div>
            )}
          </button>
        ))}
      </div>

      {visibleCount < images.length && (
        <div className="flex flex-col items-center gap-2 mt-6">
          <p className="text-sm text-gray-500">
            Prikazano {visibleCount} od {images.length} slika
          </p>
          <button
            type="button"
            onClick={() =>
              setVisibleCount((c) => Math.min(c + PAGE_SIZE, images.length))
            }
            className="px-5 py-2.5 text-sm font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-colors"
          >
            Prikaži još {Math.min(PAGE_SIZE, images.length - visibleCount)} slika
          </button>
        </div>
      )}

      <Lightbox
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        slides={slides}
      />
    </>
  )
}
