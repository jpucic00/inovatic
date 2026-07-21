'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CarouselApi } from '@/components/ui/carousel'
import {
  HeroBackgroundSlideshow,
  type HeroImage,
} from '@/components/shared/hero-background-slideshow'

interface HeroCarouselProps {
  /** Slides shown on mobile (and everywhere when `desktopImages` is omitted). */
  images: HeroImage[]
  /**
   * Optional art-directed set for `lg+`. When provided, `images` shows below
   * `lg` and these show at `lg+` (e.g. landscape shots that crop better on the
   * wide desktop hero than tall phone photos).
   */
  desktopImages?: HeroImage[]
  overlayClassName?: string
  minHeightClassName?: string
  children: React.ReactNode
}

export function HeroCarousel({
  images,
  desktopImages,
  overlayClassName,
  minHeightClassName = 'min-h-[34rem] lg:min-h-[36rem]',
  children,
}: Readonly<HeroCarouselProps>) {
  const [mobileApi, setMobileApi] = useState<CarouselApi>()
  const [desktopApi, setDesktopApi] = useState<CarouselApi>()
  const artDirected = desktopImages !== undefined

  return (
    <section className="relative overflow-hidden">
      {/* Background carousel(s) — absolute, fill the section */}
      <HeroBackgroundSlideshow
        images={images}
        setApi={setMobileApi}
        priority={!artDirected}
        className={artDirected ? 'lg:hidden' : undefined}
      />
      {artDirected && (
        <HeroBackgroundSlideshow
          images={desktopImages}
          setApi={setDesktopApi}
          priority={false}
          className="hidden lg:block"
        />
      )}

      {/* Dimmed overlay — brand teal (#08232a), transparent gradient on desktop */}
      <div
        className={cn(
          'absolute inset-0 z-10 bg-[#08232a]/50 lg:bg-transparent lg:bg-gradient-to-r lg:from-[#08232a]/80 lg:via-[#08232a]/45 lg:to-[#08232a]/12',
          overlayClassName
        )}
      />

      {/* Text content — relative, drives the section height */}
      <div className={cn('relative z-20 flex items-center py-16 pb-20', minHeightClassName)}>
        <div className="container mx-auto max-w-6xl px-4">{children}</div>
      </div>

      {/* Dot indicators — one row per active carousel, matched to its breakpoint */}
      <CarouselDots api={mobileApi} className={artDirected ? 'lg:hidden' : undefined} />
      {artDirected && <CarouselDots api={desktopApi} className="hidden lg:flex" />}
    </section>
  )
}

function CarouselDots({
  api,
  className,
}: Readonly<{ api?: CarouselApi; className?: string }>) {
  const [current, setCurrent] = useState(0)
  const [count, setCount] = useState(0)

  const onSelect = useCallback(() => {
    if (!api) return
    setCurrent(api.selectedScrollSnap())
    setCount(api.scrollSnapList().length)
  }, [api])

  useEffect(() => {
    if (!api) return
    onSelect()
    api.on('select', onSelect)
    api.on('reInit', onSelect)
    return () => {
      api.off('select', onSelect)
      api.off('reInit', onSelect)
    }
  }, [api, onSelect])

  if (count <= 1) return null

  return (
    <div
      className={cn(
        'absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2',
        className
      )}
    >
      {Array.from({ length: count }, (_, i) => `dot-${i}`).map((key, index) => (
        <button
          key={key}
          onClick={() => api?.scrollTo(index)}
          className={cn(
            'h-2 rounded-full transition-all duration-300',
            index === current ? 'w-6 bg-white' : 'w-2 bg-white/50 hover:bg-white/75'
          )}
          aria-label={`Slika ${index + 1} od ${count}`}
          aria-current={index === current ? 'true' : undefined}
        />
      ))}
    </div>
  )
}
