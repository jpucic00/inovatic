import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CourseHero } from '@/components/public/course-hero'
import type { Course } from '@/lib/courses-data'

// next/image renders a plain <img> in jsdom; drop the layout-only props so React
// doesn't warn about unknown boolean attributes (fill/priority/sizes) on a native element.
vi.mock('next/image', () => ({
  default: ({ alt, src }: Readonly<{ alt: string; src: string }>) => <img alt={alt} src={src} />,
}))

// next/link → plain anchor so we can assert href without an App Router context.
vi.mock('next/link', () => ({
  default: ({ href, children, className }: Readonly<{ href: string; children: ReactNode; className?: string }>) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const course: Course = {
  slug: 'slr-1',
  level: 'SLR_1',
  title: 'Svijet LEGO Robotike 1',
  subtitle: 'Početni program robotike za djecu (6 – 8 godina)',
  description: 'Opis programa.',
  ageMin: 6,
  ageMax: 8,
  equipment: 'LEGO SPIKE Essential',
  tools: 'SPIKE Essential ikone',
  priceYear: 400,
  priceModule: 110,
  hours: 56,
  sessionDuration: 90,
  sessionFrequency: 'Jednom tjedno',
  season: 'Listopad – Svibanj',
  groupSize: 10,
  coverImage: '/images/courses/slr-1/cover.webp',
  heroBg: '/images/courses/slr-1/hero-bg.webp',
  heroRobot: { src: '/images/courses/slr-1/hero-robot.webp', width: 1100, height: 943 },
  modules: [],
  color: 'text-cyan-600',
  gradient: 'from-cyan-400 to-cyan-600',
  highlightColor: 'bg-cyan-50 border-cyan-200',
}

describe('CourseHero', () => {
  it('renders the level badge, title and subtitle', () => {
    render(<CourseHero course={course} level={1} />)

    expect(screen.getByText('Razina 1 od 4')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Svijet LEGO Robotike 1')
    expect(screen.getByText('Početni program robotike za djecu (6 – 8 godina)')).toBeTruthy()
  })

  it('derives the key-fact chips from course data', () => {
    render(<CourseHero course={course} level={1} />)

    expect(screen.getByText('6–8 godina')).toBeTruthy()
    expect(screen.getByText('90 min · 1× tjedno')).toBeTruthy()
    // Group size is a chip (desktop) and also a facts-row entry (mobile) — both in the DOM.
    expect(screen.getAllByText('do 10 polaznika')).toHaveLength(2)
  })

  it('renders the secondary facts row (equipment, tools, hours, season)', () => {
    render(<CourseHero course={course} level={1} />)

    expect(screen.getByText('LEGO SPIKE Essential')).toBeTruthy()
    expect(screen.getByText('SPIKE Essential ikone')).toBeTruthy()
    expect(screen.getByText('56 sati godišnje')).toBeTruthy()
    expect(screen.getByText('Listopad – Svibanj')).toBeTruthy()
  })

  it('wires the back link and both CTAs to their existing targets', () => {
    render(<CourseHero course={course} level={1} />)

    expect(screen.getByRole('link', { name: /Svi programi/ }).getAttribute('href')).toBe('/programi')
    expect(screen.getByRole('link', { name: 'Pošalji prijavu za upis' }).getAttribute('href')).toBe('/upisi')
    expect(screen.getByRole('link', { name: /Pogledaj cijene/ }).getAttribute('href')).toBe('#cijene')
  })
})
