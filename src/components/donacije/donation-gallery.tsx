'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import Lightbox from 'yet-another-react-lightbox'
import Download from 'yet-another-react-lightbox/plugins/download'
import 'yet-another-react-lightbox/styles.css'

interface GalleryImage {
  src: string
  alt: string
}

interface Props {
  images: GalleryImage[]
}

export function DonationGallery({ images }: Readonly<Props>) {
  const [index, setIndex] = useState(-1)
  const open = useCallback((i: number) => setIndex(i), [])

  const slides = images.map((img) => ({
    src: img.src,
    alt: img.alt,
    download: { url: img.src, filename: img.src.split('/').pop() ?? 'slika.webp' },
  }))

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => open(i)}
            className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 block w-full cursor-zoom-in"
          >
            <Image
              src={img.src}
              alt={img.alt}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
            />
          </button>
        ))}
      </div>

      <Lightbox
        open={index >= 0}
        index={Math.max(0, index)}
        close={() => setIndex(-1)}
        slides={slides}
        plugins={[Download]}
      />
    </>
  )
}
