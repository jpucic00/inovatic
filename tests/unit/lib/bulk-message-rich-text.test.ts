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

  it('carries the font size inline', async () => {
    const html = await render([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Sitno', styles: { fontSize: 'sm' } }],
      },
    ])
    expect(html).toMatch(/font-size:13px[^>]*>Sitno|Sitno/)
    expect(html).toContain('13px')
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
