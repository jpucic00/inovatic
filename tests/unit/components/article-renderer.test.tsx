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

  it('renders every inline mark BlockNote actually stores', () => {
    // Keyed on BlockNote's own spelling — `strike`, not `strikethrough`. The
    // renderer read the latter until 2026-09-06, so struck-through text was
    // published as plain text with nothing to signal the loss.
    const { container } = renderBlocks([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Podebljano', styles: { bold: true } },
          { type: 'text', text: 'Kurziv', styles: { italic: true } },
          { type: 'text', text: 'Podcrtano', styles: { underline: true } },
          { type: 'text', text: 'Precrtano', styles: { strike: true } },
          { type: 'text', text: 'Kod', styles: { code: true } },
        ],
      },
    ])

    expect(container.querySelector('strong')?.textContent).toBe('Podebljano')
    expect(container.querySelector('em')?.textContent).toBe('Kurziv')
    expect(container.querySelector('u')?.textContent).toBe('Podcrtano')
    expect(container.querySelector('s')?.textContent).toBe('Precrtano')
    expect(container.querySelector('code')?.textContent).toBe('Kod')
  })

  it('combines marks on one run, innermost text intact', () => {
    const { container } = renderBlocks([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Stara cijena', styles: { bold: true, strike: true } }],
      },
    ])

    const struck = container.querySelector('s')
    expect(struck).not.toBeNull()
    expect(struck?.querySelector('strong')?.textContent).toBe('Stara cijena')
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
