'use client'

import Image from 'next/image'
import Autoplay from 'embla-carousel-autoplay'
import { cn } from '@/lib/utils'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel'

export interface HeroImage {
  src: string
  alt: string
  /**
   * CSS `object-position` focal point (e.g. `'50% 35%'`). The hero is a wide,
   * short box, so tall phone photos are cropped top/bottom — bias this toward
   * the faces so they stay in frame. Defaults to centered.
   */
  objectPosition?: string
}

interface HeroBackgroundSlideshowProps {
  images: HeroImage[]
  setApi?: (api: CarouselApi) => void
  /** Extra classes on the carousel root — used for responsive show/hide when art-directing mobile vs. desktop sets. */
  className?: string
  /**
   * Mark the first slide `priority` (preloaded, high fetch priority). Leave
   * `false` when two art-directed slideshows share a hero, so the breakpoint
   * that is hidden does not preload its images. Defaults to `true`.
   */
  priority?: boolean
}

/**
 * Full-bleed autoplaying background image carousel. Absolutely positioned to
 * fill its nearest positioned ancestor — the parent owns the overlay, text
 * content and section height.
 */
export function HeroBackgroundSlideshow({
  images,
  setApi,
  className,
  priority = true,
}: Readonly<HeroBackgroundSlideshowProps>) {
  return (
    <Carousel
      setApi={setApi}
      opts={{ loop: true }}
      plugins={[
        Autoplay({
          delay: 5000,
          stopOnInteraction: false,
          stopOnMouseEnter: true,
        }),
      ]}
      className={cn(
        'absolute inset-0 z-0 [&_[data-slot=carousel-content]]:h-full',
        className
      )}
    >
      <CarouselContent className="-ml-0 h-full">
        {images.map((image, index) => (
          <CarouselItem key={image.src} className="pl-0 relative">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              className="object-cover"
              style={{ objectPosition: image.objectPosition }}
              priority={priority && index === 0}
              sizes="100vw"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}
