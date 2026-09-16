/**
 * The composed e-mail body: what survives normalization, what the flattened
 * plain text says, and where the length limit is actually measured.
 *
 * These rules are load-bearing in two directions at once — the validator and
 * the send action both call `resolveEmailBody`, and the template falls back to
 * plain text whenever blocks are absent — so each case here is a shape the
 * composer, an old campaign, or a tampered payload can genuinely produce.
 */
import { describe, expect, it } from 'vitest'
import {
  EMAIL_BODY_MAX_LENGTH,
  flattenRichText,
  isSafeEmailHref,
  parseRichBlocks,
  plainTextToBlocks,
  resolveEmailBody,
  type EmailRichBlock,
} from '@/lib/email-rich-text'

const para = (text: string): EmailRichBlock => ({
  type: 'paragraph',
  content: [{ type: 'text', text, styles: {} }],
})

describe('isSafeEmailHref', () => {
  it('accepts the three schemes an inbox can follow', () => {
    expect(isSafeEmailHref('https://udruga-inovatic.hr/prijava')).toBe(true)
    expect(isSafeEmailHref('http://udruga-inovatic.hr')).toBe(true)
    expect(isSafeEmailHref('mailto:prijave@udruga-inovatic.hr')).toBe(true)
  })

  it('refuses script and data URLs whatever their casing', () => {
    expect(isSafeEmailHref('javascript:alert(1)')).toBe(false)
    expect(isSafeEmailHref('JavaScript:alert(1)')).toBe(false)
    expect(isSafeEmailHref('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
  })

  it('caps the href length and stores it trimmed', () => {
    expect(isSafeEmailHref(`https://udruga-inovatic.hr/${'a'.repeat(2000)}`)).toBe(false)
    const parsed = parseRichBlocks([
      {
        type: 'paragraph',
        content: [
          { type: 'link', href: '  https://udruga-inovatic.hr/prijava ', content: [{ type: 'text', text: 'x', styles: {} }] },
        ],
      },
    ])
    expect(parsed?.[0].content[0]).toMatchObject({ type: 'link', href: 'https://udruga-inovatic.hr/prijava' })
  })

  it('refuses hrefs an inbox cannot resolve', () => {
    // Relative — meaningless once the mail has left the site.
    expect(isSafeEmailHref('/prijava')).toBe(false)
    // Protocol-relative — resolves against whatever scheme the client picks.
    expect(isSafeEmailHref('//evil.example/x')).toBe(false)
    expect(isSafeEmailHref('   ')).toBe(false)
  })
})

describe('flattenRichText', () => {
  it('joins blocks as lines, marks stripped', () => {
    const blocks: EmailRichBlock[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Upisi su ', styles: {} },
          { type: 'text', text: 'otvoreni', styles: { bold: true } },
          { type: 'text', text: '.', styles: {} },
        ],
      },
      para('Javite nam se.'),
    ]
    expect(flattenRichText(blocks)).toBe('Upisi su otvoreni.\nJavite nam se.')
  })

  it('keeps a link’s words but not its href', () => {
    const blocks: EmailRichBlock[] = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Prijava na ', styles: {} },
          {
            type: 'link',
            href: 'https://udruga-inovatic.hr/prijava',
            content: [{ type: 'text', text: 'našoj stranici', styles: {} }],
          },
        ],
      },
    ]
    expect(flattenRichText(blocks)).toBe('Prijava na našoj stranici')
  })

  it('re-adds list markers, restarting the numbering per run', () => {
    const blocks: EmailRichBlock[] = [
      { type: 'numberedListItem', content: [{ type: 'text', text: 'Prvo', styles: {} }] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'Drugo', styles: {} }] },
      para('Zatim:'),
      { type: 'bulletListItem', content: [{ type: 'text', text: 'A', styles: {} }] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'Opet prvo', styles: {} }] },
    ]
    // Without the markers a flattened list is one run-on paragraph, and without
    // the restart the second list would read as item 3 of the first.
    expect(flattenRichText(blocks)).toBe('1. Prvo\n2. Drugo\nZatim:\n• A\n1. Opet prvo')
  })

  it('does not skip a number over an empty list item', () => {
    // The mail renders no marker for an empty item, so the flattened history
    // must not read "1. A / 3. C" for a list the parent saw as 1, 2.
    const text = flattenRichText([
      { type: 'numberedListItem', content: [{ type: 'text', text: 'A', styles: {} }] },
      { type: 'numberedListItem', content: [] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'C', styles: {} }] },
    ])
    expect(text).toBe('1. A\n2. C')
  })

  it('walks nested children and drops empty blocks', () => {
    const blocks: EmailRichBlock[] = [
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: 'Roditelj', styles: {} }],
        children: [
          { type: 'bulletListItem', content: [{ type: 'text', text: 'Dijete', styles: {} }] },
        ],
      },
      { type: 'paragraph', content: [] },
    ]
    expect(flattenRichText(blocks)).toBe('• Roditelj\n• Dijete')
  })
})

describe('parseRichBlocks', () => {
  it('stops descending past the depth cap instead of overflowing the stack', () => {
    // A payload nested thousands deep is what an admin session could post;
    // validation must answer with a refusal, not a RangeError.
    let deep: unknown = para('dno')
    for (let i = 0; i < 5000; i++) {
      deep = { type: 'bulletListItem', content: [], children: [deep] }
    }
    const parsed = parseRichBlocks([deep])
    expect(parsed).not.toBeNull()
    expect(flattenRichText(parsed!)).not.toContain('dno')

    // A realistic indent survives untouched.
    const shallow = parseRichBlocks([
      { type: 'bulletListItem', content: [], children: [{ type: 'bulletListItem', content: [], children: [para('treća razina')] }] },
    ])
    expect(flattenRichText(shallow!)).toContain('treća razina')
  })

  it('reads back what the editor stores', () => {
    const stored = [
      {
        id: 'x',
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Naslov', styles: { bold: true, fontSize: 'lg' } }],
        children: [],
      },
    ]
    expect(parseRichBlocks(stored)).toEqual([
      {
        type: 'heading',
        props: { level: 2 },
        content: [{ type: 'text', text: 'Naslov', styles: { bold: true, fontSize: 'lg' } }],
      },
    ])
  })

  it('drops block types outside the e-mail schema', () => {
    // An image pasted into the editor, or a payload built by hand.
    expect(parseRichBlocks([{ type: 'image', props: { url: 'x' }, content: [] }])).toBeNull()
  })

  it('drops an unsafe link but keeps the words inside it', () => {
    const parsed = parseRichBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: 'javascript:alert(1)',
            content: [{ type: 'text', text: 'kliknite ovdje', styles: {} }],
          },
        ],
      },
    ])
    // The sentence the admin wrote still reaches the parent; only the link goes.
    expect(parsed).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'kliknite ovdje', styles: {} }],
      },
    ])
  })

  it('ignores styles it does not carry, including an invented font size', () => {
    const parsed = parseRichBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Tekst',
            styles: { bold: true, textColor: 'red', fontSize: '96px' },
          },
        ],
      },
    ])
    expect(parsed?.[0].content[0]).toEqual({
      type: 'text',
      text: 'Tekst',
      styles: { bold: true },
    })
  })

  it('reads a missing column as null rather than throwing', () => {
    // Every campaign sent before the column existed.
    expect(parseRichBlocks(null)).toBeNull()
    expect(parseRichBlocks(undefined)).toBeNull()
    expect(parseRichBlocks('[]')).toBeNull()
    expect(parseRichBlocks([])).toBeNull()
  })
})

describe('resolveEmailBody', () => {
  it('re-derives bodyText from the blocks, ignoring what the client claimed', () => {
    const resolved = resolveEmailBody({
      bodyText: 'nešto sasvim drugo',
      bodyBlocks: [para('Pozivamo vas na upis.')],
    })
    expect(resolved).toMatchObject({ ok: true, bodyText: 'Pozivamo vas na upis.' })
  })

  it('measures the limit on the flattened text, not on the JSON', () => {
    const long = 'a'.repeat(EMAIL_BODY_MAX_LENGTH + 1)
    const resolved = resolveEmailBody({ bodyText: 'kratki tekst', bodyBlocks: [para(long)] })
    // A short client-supplied bodyText must not wave an over-long body through.
    expect(resolved.ok).toBe(false)
  })

  it('accepts formatting that adds JSON but no readable text', () => {
    // The encoded document is far larger than the message; only the message counts.
    const blocks: EmailRichBlock[] = Array.from({ length: 40 }, () => ({
      type: 'paragraph',
      content: [{ type: 'text', text: 'riječ', styles: { bold: true, fontSize: 'lg' } }],
    }))
    expect(resolveEmailBody({ bodyText: '', bodyBlocks: blocks }).ok).toBe(true)
  })

  it('treats an explicit null — the stored value of a pre-rich-text row — like an omitted field', () => {
    const omitted = resolveEmailBody({ bodyText: 'Poruka bez formatiranja.' })
    const nulled = resolveEmailBody({ bodyText: 'Poruka bez formatiranja.', bodyBlocks: null })
    expect(nulled).toEqual(omitted)
    expect(nulled).toEqual({ ok: true, bodyText: 'Poruka bez formatiranja.', bodyBlocks: null })
  })

  it('falls back to the plain text when no blocks were submitted', () => {
    const resolved = resolveEmailBody({ bodyText: '  Kratka obavijest.  ' })
    expect(resolved).toEqual({ ok: true, bodyText: 'Kratka obavijest.', bodyBlocks: null })
  })

  it('refuses blocks that leave nothing behind rather than silently using bodyText', () => {
    const resolved = resolveEmailBody({
      bodyText: 'ovo bi inače prošlo',
      bodyBlocks: [{ type: 'image', props: { url: 'x' } }],
    })
    expect(resolved.ok).toBe(false)
  })

  it('refuses a body that is only formatting', () => {
    expect(resolveEmailBody({ bodyText: '', bodyBlocks: [{ type: 'paragraph', content: [] }] }).ok).toBe(
      false,
    )
  })
})

describe('plainTextToBlocks', () => {
  it('round-trips through flattenRichText', () => {
    const text = 'Poštovani,\nUpisi su otvoreni.\nJavite nam se.'
    expect(flattenRichText(plainTextToBlocks(text))).toBe(text)
  })
})
