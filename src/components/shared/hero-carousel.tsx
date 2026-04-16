'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Autoplay from 'embla-carousel-autoplay'
import { cn } from '@/lib/utils'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel'

interface HeroImage {
  src: string
  alt: string
}

interface HeroCarouselProps {
  images: HeroImage[]
  overlayClassName?: string
  children: React.ReactNode
}

export function HeroCarousel({
  images,
  overlayClassName,
  children,
}: HeroCarouselProps) {
  const [api, setApi] = useState<CarouselApi>()
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

  return (
    <section className="relative overflow-hidden">
      {/* Background carousel — absolute, fills the section */}
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
        className="absolute inset-0 z-0 [&_[data-slot=carousel-content]]:h-full"
      >
        <CarouselContent className="-ml-0 h-full">
          {images.map((image, index) => (
            <CarouselItem key={index} className="pl-0 relative">
              <Image
                src={image.src}
                alt={image.alt}
                fill
                className="object-cover"
                priority={index === 0}
                sizes="100vw"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Dimmed overlay */}
      <div
        className={cn(
          'absolute inset-0 z-10 bg-black/50 lg:bg-gradient-to-r lg:from-black/65 lg:via-black/45 lg:to-black/25',
          overlayClassName
        )}
      />

      {/* Text content — relative, drives the section height */}
      <div className="relative z-20 flex items-center min-h-[34rem] lg:min-h-[36rem] py-16 pb-20">
        <div className="container mx-auto max-w-6xl px-4">{children}</div>
      </div>

      {/* Dot indicators */}
      {count > 1 && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {Array.from({ length: count }).map((_, index) => (
            <button
              key={index}
              onClick={() => api?.scrollTo(index)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                index === current
                  ? 'w-6 bg-white'
                  : 'w-2 bg-white/50 hover:bg-white/75'
              )}
              aria-label={`Slika ${index + 1} od ${count}`}
              aria-current={index === current ? 'true' : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}
