'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Maximize2 } from 'lucide-react'
import Lightbox from 'yet-another-react-lightbox'
import Download from 'yet-another-react-lightbox/plugins/download'
import 'yet-another-react-lightbox/styles.css'

interface Props {
  src: string
  alt: string
}

export function DonationBarcode({ src, alt }: Readonly<Props>) {
  const [open, setOpen] = useState(false)
  const filename = src.split('/').pop() ?? 'barkod.jpeg'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Povećaj barkod preko cijelog zaslona"
        className="group relative block w-full max-w-xs cursor-zoom-in rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      >
        <Image src={src} alt={alt} width={308} height={137} className="w-full h-auto" unoptimized priority />
        <span className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-gray-500 shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </button>

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        slides={[{ src, alt, download: { url: src, filename } }]}
        plugins={[Download]}
        carousel={{ finite: true }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
      />
    </>
  )
}
