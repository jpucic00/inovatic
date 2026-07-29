import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PartialBlock } from '@blocknote/core'
import { ArticleRenderer } from '@/components/article/article-renderer'

const text = (t: string) => [{ type: 'text', text: t, styles: {} }]

const renderBlocks = (content: unknown[]) =>
  render(<ArticleRenderer content={content as PartialBlock[]} />)

describe('ArticleRenderer', () => {
  it('renders a toggle list as <details> with its nested body visible', () => {
    const { container } = renderBlocks([
      {
        type: 'toggleListItem',
        content: text('Što je uključeno?'),
        children: [
          { type: 'paragraph', content: text('Sav materijal i oprema.') },
          { type: 'bulletListItem', content: text('Užina') },
        ],
      },
    ])

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    // Open by default — a collapsed toggle reads as missing content.
    expect(details?.hasAttribute('open')).toBe(true)
    expect(container.querySelector('summary')?.textContent).toBe('Što je uključeno?')
    expect(screen.getByText('Sav materijal i oprema.')).toBeTruthy()
    expect(details?.querySelector('ul li')?.textContent).toBe('Užina')
  })

  it('keeps text that follows a toggle at top level', () => {
    renderBlocks([
      { type: 'toggleListItem', content: text('Naslov'), children: [] },
      { type: 'paragraph', content: text('Tekst nakon toggle liste.') },
    ])

    expect(screen.getByText('Tekst nakon toggle liste.')).toBeTruthy()
  })

  it('renders an indented bullet inside its parent <li>', () => {
    const { container } = renderBlocks([
      {
        type: 'bulletListItem',
        content: text('Roditelj'),
        children: [{ type: 'bulletListItem', content: text('Dijete') }],
      },
    ])

    const nested = container.querySelector('ul > li > ul > li')
    expect(nested?.textContent).toBe('Dijete')
  })

  it('still shows the text of a block type it has no branch for', () => {
    renderBlocks([{ type: 'quote', content: text('Citat koji ne smije nestati.') }])

    expect(screen.getByText('Citat koji ne smije nestati.')).toBeTruthy()
  })

  it('does not throw on a table, whose content is an object not an array', () => {
    expect(() =>
      renderBlocks([
        { type: 'table', content: { type: 'tableContent', rows: [] } },
        { type: 'paragraph', content: text('Poslije tablice.') },
      ]),
    ).not.toThrow()

    expect(screen.getByText('Poslije tablice.')).toBeTruthy()
  })
})
