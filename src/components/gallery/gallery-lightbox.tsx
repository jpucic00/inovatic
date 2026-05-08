'use client'

import Lightbox from 'yet-another-react-lightbox'
import Download from 'yet-another-react-lightbox/plugins/download'
import 'yet-another-react-lightbox/styles.css'
import type { GalleryImageRow } from '@/actions/teacher/gallery'

interface Props {
  images: GalleryImageRow[]
  index: number
  onClose: () => void
}

export function GalleryLightbox({ images, index, onClose }: Readonly<Props>) {
  const slides = images.map((img) => {
    const filename = (img.publicId.split('/').pop() ?? 'slika') + '.jpg'
    return {
      src: img.url,
      alt: img.caption ?? '',
      download: { url: img.url, filename },
      ...(img.caption ? { description: img.caption } : {}),
    }
  })

  return (
    <Lightbox
      open={index >= 0}
      index={Math.max(0, index)}
      close={onClose}
      slides={slides}
      plugins={[Download]}
    />
  )
}
