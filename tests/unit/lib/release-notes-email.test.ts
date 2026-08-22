/**
 * What the release e-mail actually puts in front of an administrator.
 *
 * Asserted on the rendered HTML rather than on props, because the two things
 * that can go wrong here are both about what appears at all: a note silently
 * dropped from the list, and the association's own contact card closing a mail
 * addressed to the association itself — the same mistake the upit notification
 * exists to avoid.
 */
import { createElement } from 'react'
import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'
import type { ReleaseNote } from '@/lib/releases'
import ReleaseNotesEmail from '../../../emails/release-notes'

const release: ReleaseNote = {
  version: '1.2.0',
  date: '2026-08-18',
  title: 'Upiti sada odmah pokazuju je li dijete već bilo polaznik.',
  sections: [
    {
      area: 'Upiti',
      changes: ['Uz dijete koje kod nas već ima račun stoji oznaka "Ponovni upis".'],
    },
    {
      area: 'Prijavnica',
      changes: ['Roditelj koji je odabrao termin više ne dobiva krivu poruku.'],
    },
  ],
}

function renderEmail(overrides: Partial<ReleaseNote> = {}) {
  return render(
    createElement(ReleaseNotesEmail, {
      release: { ...release, ...overrides },
      appUrl: 'https://udruga-inovatic.hr',
    }),
  )
}

describe('release notes email', () => {
  it('leads with the version and the Croatian date', async () => {
    const html = await renderEmail()
    expect(html).toContain('Verzija 1.2.0')
    expect(html).toContain('18.08.2026.')
    expect(html).toContain('Nova verzija aplikacije')
  })

  it('prints every note under its own heading, in the order they were written', async () => {
    const html = await renderEmail()
    const firstArea = html.indexOf('Upiti')
    const first = html.indexOf('Uz dijete koje kod nas')
    const secondArea = html.indexOf('Prijavnica')
    const second = html.indexOf('Roditelj koji je odabrao termin')
    for (const at of [firstArea, first, secondArea, second]) {
      expect(at).toBeGreaterThan(-1)
    }
    // Sections and the lines inside them are ordered by whoever wrote the note,
    // so the template must not sort or regroup them into a shape of its own.
    expect(firstArea).toBeLessThan(first)
    expect(first).toBeLessThan(secondArea)
    expect(secondArea).toBeLessThan(second)
  })

  it('adds no grouping the note did not ask for', async () => {
    // The headings are the note's — the parts of the app it touched. What must
    // never come back is a novo/poboljšano/ispravljeno split, which tears one
    // feature in two the moment it both adds and changes something.
    const html = await renderEmail()
    expect(html).not.toContain('Poboljšano')
    expect(html).not.toContain('Ispravljeno')
    // A section the note never wrote must not appear either.
    expect(html).not.toContain('Razno')
  })

  it('drops nothing when a release touches one place only', async () => {
    const html = await renderEmail({
      sections: [{ area: 'Dolazak', changes: ['Ručno dodan datum preživi osvježavanje.'] }],
    })
    expect(html).toContain('Dolazak')
    expect(html).toContain('Ručno dodan datum preživi osvježavanje.')
    // The replaced sections are gone. Asserted on their own text rather than on
    // the area name: "Upiti" is also a word in this fixture's title, so the
    // heading alone cannot tell a rendered section from the sentence above it.
    expect(html).not.toContain('Prijavnica')
    expect(html).not.toContain('Roditelj koji je odabrao termin')
    expect(html).not.toContain('Uz dijete koje kod nas')
  })

  it('does not close with the association’s own contact card', async () => {
    const html = await renderEmail()
    expect(html).not.toContain('prijave.sibenik@udruga-inovatic.hr')
    expect(html).not.toContain('S poštovanjem')
  })
})
