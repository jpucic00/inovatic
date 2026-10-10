import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MaterialCards } from '@/components/portal/extra-materials'
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
    audience: 'STUDENT',
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

describe('MaterialCards', () => {
  it('keeps the order the mentor gave the lesson and labels each card by kind', () => {
    render(<MaterialCards items={MIXED()} />)

    const titles = ['Snimka sata', 'Radni list', 'Popis dijelova', 'Scratch']
    const text = document.body.textContent ?? ''
    const positions = titles.map((t) => text.indexOf(t))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(screen.getAllByText('Dokument')).toHaveLength(2)
    expect(screen.getByText('Poveznica')).toBeTruthy()
  })

  it('expands a video in place instead of navigating away', () => {
    render(<MaterialCards items={MIXED()} />)

    const card = screen.getByRole('button', { name: /Snimka sata/ })
    expect(card.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('video-embed')).toBeNull()

    fireEvent.click(card)

    expect(card.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('video-embed')).toBeTruthy()
  })

  it('renders a document as a link to the authorised download', () => {
    render(<MaterialCards items={MIXED()} />)
    const link = screen.getByRole('link', { name: /Radni list/ })
    expect(link.getAttribute('href')).toMatch(/^\/api\/download\//)
  })

  it('renders an openable-nowhere row inert, not as a dead link', () => {
    render(
      <MaterialCards
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
