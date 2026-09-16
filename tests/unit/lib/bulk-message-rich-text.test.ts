/**
 * The formatted body, rendered for an inbox.
 *
 * Asserted on the rendered HTML rather than on the renderer's source, because
 * the property that matters is the one a mail client sees: every dimension of
 * the look has to travel inline on the element. A rule that ends up in a
 * stylesheet is silently dropped by half the clients this is sent to.
 */
import { describe, expect, it } from 'vitest'
import { renderBulkMessageHtml } from '@/lib/email'
import type { EmailRichBlock } from '@/lib/email-rich-text'

const render = (bodyBlocks: EmailRichBlock[] | null, bodyText = 'Zamjenski tekst poruke.') =>
  renderBulkMessageHtml({ subject: 'Obavijest – Inovatic', bodyText, bodyBlocks })

describe('bulk-message rich body', () => {
  it('renders marks as elements, so emphasis survives a client that strips CSS', async () => {
    const html = await render([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Upisi su ', styles: {} },
          { type: 'text', text: 'otvoreni', styles: { bold: true } },
          { type: 'text', text: ' i ', styles: {} },
          { type: 'text', text: 'traju', styles: { italic: true } },
        ],
      },
    ])
    expect(html).toContain('<strong>otvoreni</strong>')
    expect(html).toContain('<em>traju</em>')
  })

  it('carries the font size inline, on the run itself', async () => {
    const html = await render([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Sitno', styles: { fontSize: 'sm' } },
          { type: 'text', text: ' i ', styles: {} },
          { type: 'text', text: 'Veliko', styles: { fontSize: 'lg' } },
        ],
      },
    ])
    // Anchored on the run's own element: the layout's footer is 13px too, so a
    // bare `toContain('13px')` would pass with the fontSize branch deleted.
    expect(html).toMatch(/<span style="font-size:13px">Sitno<\/span>/)
    expect(html).toMatch(/<span style="font-size:19px">Veliko<\/span>/)
  })

  it('renders underline and strike as elements — the marks a wrong key would drop silently', async () => {
    const html = await render([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Podcrtano', styles: { underline: true } },
          { type: 'text', text: ' ', styles: {} },
          { type: 'text', text: 'Precrtano', styles: { strike: true } },
          { type: 'text', text: ' ', styles: {} },
          { type: 'text', text: 'Oboje', styles: { bold: true, strike: true } },
        ],
      },
    ])
    expect(html).toContain('<u>Podcrtano</u>')
    expect(html).toContain('<s>Precrtano</s>')
    expect(html).toContain('<s><strong>Oboje</strong></s>')
  })

  it('renders a heading as an h2 whose size travels inline', async () => {
    const html = await render([
      { type: 'heading', props: { level: 1 }, content: [{ type: 'text', text: 'Naslov', styles: {} }] },
      { type: 'heading', props: { level: 3 }, content: [{ type: 'text', text: 'Podnaslov', styles: {} }] },
    ])
    expect(html).toMatch(/<h2[^>]*font-size:22px[^>]*>Naslov<\/h2>/)
    expect(html).toMatch(/<h2[^>]*font-size:17px[^>]*>Podnaslov<\/h2>/)
  })

  it('numbers an ordered list and nests an indented item inside its parent', async () => {
    const html = await render([
      { type: 'numberedListItem', content: [{ type: 'text', text: 'Prvo', styles: {} }] },
      {
        type: 'numberedListItem',
        content: [{ type: 'text', text: 'Drugo', styles: {} }],
        children: [{ type: 'bulletListItem', content: [{ type: 'text', text: 'Ugniježđeno', styles: {} }] }],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Između.', styles: {} }] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'Treće', styles: {} }] },
    ])
    // A paragraph splits the run: two <ol>, and the nested bullet's <ul> sits
    // inside the second <li> rather than after the list.
    expect(html.match(/<ol[ >]/g)).toHaveLength(2)
    expect(html.match(/<ul[ >]/g)).toHaveLength(1)
    expect(html).toMatch(/<li[^>]*>Drugo<ul[^>]*><li[^>]*>Ugniježđeno<\/li><\/ul><\/li>/)
  })

  it('renders a link with its href', async () => {
    const html = await render([
      {
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: 'https://udruga-inovatic.hr/prijava',
            content: [{ type: 'text', text: 'Prijava', styles: {} }],
          },
        ],
      },
    ])
    expect(html).toContain('https://udruga-inovatic.hr/prijava')
    expect(html).toContain('Prijava')
  })

  it('groups a run of list items into one list', async () => {
    const html = await render([
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Prvo', styles: {} }] },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Drugo', styles: {} }] },
    ])
    expect(html.match(/<ul[ >]/g)).toHaveLength(1)
    // `<li[ >]` and not `<li` — the layout's own <link> tags match the looser one.
    expect(html.match(/<li[ >]/g)).toHaveLength(2)
  })

  it('falls back to the plain text when a campaign has no blocks', async () => {
    // Every campaign sent before rich text existed — including the PENDING half
    // of one being resumed, which must render like the half already delivered.
    const html = await render(null, 'Prvi odlomak.\nDrugi odlomak.')
    expect(html).toContain('Prvi odlomak.')
    expect(html).toContain('Drugi odlomak.')
  })

  it('prefers the blocks over the plain text when both are present', async () => {
    const html = await render([
      { type: 'paragraph', content: [{ type: 'text', text: 'Formatirana verzija.', styles: {} }] },
    ])
    expect(html).toContain('Formatirana verzija.')
    // `bodyText` stays on the row for the history view; it must not also be mailed.
    expect(html).not.toContain('Zamjenski tekst poruke.')
  })
})
