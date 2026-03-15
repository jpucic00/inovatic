'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'

interface GalleryImage {
  id: string
  url: string
  caption: string | null
}

interface Props {
  images: GalleryImage[]
  articleTitle: string
}

export function ArticleGallery({ images, articleTitle }: Props) {
  const [index, setIndex] = useState(-1)

  const slides = images.map((img) => ({
    src: img.url,
    alt: img.caption ?? articleTitle,
    ...(img.caption ? { description: img.caption } : {}),
  }))

  const open = useCallback((i: number) => setIndex(i), [])

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => open(i)}
            className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 block w-full cursor-zoom-in"
          >
            <Image
              src={img.url}
              alt={img.caption ?? articleTitle}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, 33vw"
            />
            {img.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-xs px-2 py-1.5 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                {img.caption}
              </div>
            )}
          </button>
        ))}
      </div>

      <Lightbox
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        slides={slides}
      />
    </>
  )
}
