import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ExtraMaterials } from '@/components/portal/extra-materials'
import type { MaterialItem } from '@/lib/group-materials-view'
import type { MaterialType } from '@prisma/client'

vi.mock('@/components/material/video-embed', () => ({
  VideoEmbed: ({ title }: { title?: string }) => (
    <div data-testid="video-embed">{title}</div>
  ),
}))

let seq = 0
function item(
  title: string,
  type: MaterialType,
  overrides: Partial<MaterialItem> = {},
): MaterialItem {
  seq += 1
  return {
    id: `m${seq}`,
    title,
    description: null,
    type,
    fileUrl: null,
    externalUrl: null,
    fileSize: null,
    mimeType: null,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

const MIXED = () => [
  item('Snimka sata', 'VIDEO', { externalUrl: 'https://www.youtube.com/watch?v=x' }),
  item('Radni list', 'DOCUMENT', { fileUrl: 'https://cdn/x.pdf', fileSize: 2048 }),
  item('Popis dijelova', 'DOCUMENT', { fileUrl: 'https://cdn/y.pdf' }),
  item('Scratch', 'LINK', { externalUrl: 'https://scratch.mit.edu' }),
]

describe('ExtraMaterials — filter chips', () => {
  // The chips render only at 2+ kinds and are exercised by no other test at
  // any tier (the E2E fixture happens to hold a single kind) — this is their
  // only regression net.
  it('renders a chip per present kind, with counts and an all-chip', () => {
    render(<ExtraMaterials items={MIXED()} />)

    expect(screen.getByRole('button', { name: /Sve\s*4/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Videi\s*1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Dokumenti\s*2/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Poveznice\s*1/ })).toBeTruthy()
    // No presentations in the set — no chip claims an empty bucket.
    expect(screen.queryByRole('button', { name: /Prezentacije/ })).toBeNull()
    expect(screen.getByText('4 od 4 materijala')).toBeTruthy()
  })

  it('narrows the grid to the picked kind and says how much it hid', () => {
    render(<ExtraMaterials items={MIXED()} />)

    fireEvent.click(screen.getByRole('button', { name: /Dokumenti/ }))

    expect(screen.getByText('Radni list')).toBeTruthy()
    expect(screen.getByText('Popis dijelova')).toBeTruthy()
    expect(screen.queryByText('Snimka sata')).toBeNull()
    expect(screen.queryByText('Scratch')).toBeNull()
    expect(screen.getByText('2 od 4 materijala')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Dokumenti/ }).getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /Sve/ }))
    expect(screen.getByText('Snimka sata')).toBeTruthy()
  })

  it('renders no chips at all when only one kind is present', () => {
    render(
      <ExtraMaterials
        items={[
          item('Prvi', 'DOCUMENT', { fileUrl: 'https://cdn/a.pdf' }),
          item('Drugi', 'DOCUMENT', { fileUrl: 'https://cdn/b.pdf' }),
        ]}
      />,
    )

    // The chips would only ever say "all of them".
    expect(screen.queryByRole('button', { name: /Sve/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Dokumenti/ })).toBeNull()
  })
})

describe('ExtraMaterials — cards', () => {
  it('expands a video in place instead of navigating away', () => {
    render(<ExtraMaterials items={MIXED()} />)

    const card = screen.getByRole('button', { name: /Snimka sata/ })
    expect(card.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('video-embed')).toBeNull()

    fireEvent.click(card)

    expect(card.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('video-embed')).toBeTruthy()
  })

  it('renders a document as a link to the authorised download', () => {
    render(<ExtraMaterials items={MIXED()} />)
    const link = screen.getByRole('link', { name: /Radni list/ })
    expect(link.getAttribute('href')).toMatch(/^\/api\/download\//)
  })

  it('renders an openable-nowhere row inert, not as a dead link', () => {
    render(
      <ExtraMaterials
        items={[
          item('Bez datoteke', 'DOCUMENT'),
          item('Poveznica', 'LINK', { externalUrl: 'https://example.com' }),
        ]}
      />,
    )

    expect(screen.queryByRole('link', { name: /Bez datoteke/ })).toBeNull()
    expect(screen.getByText('Bez datoteke').closest('[aria-disabled]')).toBeTruthy()
  })
})
