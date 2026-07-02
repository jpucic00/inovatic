'use client'

import type { ReactNode } from 'react'

interface SmoothScrollLinkProps {
  /** Target element id to scroll to (without the leading '#'). */
  targetId: string
  className?: string
  children: ReactNode
}

/**
 * An in-page anchor that smooth-scrolls to `#targetId` instead of jumping.
 * Renders a real `<a href="#targetId">` so it still works without JS and stays
 * keyboard/screen-reader friendly; the click handler upgrades the jump to a
 * smooth scroll (honoring `scroll-margin-top` on the target and the user's
 * reduced-motion preference).
 */
export function SmoothScrollLink({ targetId, className, children }: Readonly<SmoothScrollLinkProps>) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(targetId)
    if (!el) return // no target → let the browser's default #hash jump happen
    e.preventDefault()
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' })
    // Keep the URL hash in sync (shareable / back-button) without re-triggering a jump.
    history.pushState(null, '', `#${targetId}`)
  }

  return (
    <a href={`#${targetId}`} onClick={handleClick} className={className}>
      {children}
    </a>
  )
}
