'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface CourseStickyCtaProps {
  readonly priceYear: number
  readonly priceModule: number
  /** Id of the pricing band; the bar hides once that section scrolls into view. */
  readonly targetId: string
}

/**
 * Mobile-only sticky bottom CTA bar. Visible while the user is above the pricing
 * band; hides (and stays hidden) once the band is in view or scrolled past, since
 * the CTAs already live there. Re-shows when scrolling back up above it.
 */
export function CourseStickyCta({ priceYear, priceModule, targetId }: CourseStickyCtaProps) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Hide when the pricing band is visible OR already scrolled past (its top above the viewport top).
        setHidden(entry.isIntersecting || entry.boundingClientRect.top < 0)
      },
      { threshold: 0.05 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [targetId])

  return (
    <div
      aria-hidden={hidden}
      className={`fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-4 py-2.5 backdrop-blur-[8px] transition-transform duration-150 md:hidden ${
        hidden ? 'pointer-events-none translate-y-full' : 'translate-y-0'
      }`}
      style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
    >
      <div>
        <div className="text-sm font-extrabold text-gray-900">
          {priceYear} EUR
          <span className="text-[11.5px] font-medium text-gray-500"> / god.</span>
        </div>
        <div className="text-[11px] text-gray-500">ili {priceModule} EUR po modulu</div>
      </div>
      <Link
        href="/prijava"
        tabIndex={hidden ? -1 : undefined}
        className="whitespace-nowrap rounded-[11px] bg-cyan-500 px-5 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-cyan-600"
      >
        Pošalji upit
      </Link>
    </div>
  )
}
