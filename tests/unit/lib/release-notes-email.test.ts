/**
 * What the release e-mail actually puts in front of an administrator.
 *
 * Asserted on the rendered HTML rather than on props, because the two things
 * that can go wrong here are both about what appears at all: a heading with
 * nothing under it (an empty group must not print), and the association's own
 * contact card closing a mail addressed to the association itself — the same
 * mistake the upit notification exists to avoid.
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
  added: ['Na popisu upita stoji oznaka "Ponovni upis".'],
  fixed: ['Roditelj koji je odabrao termin više ne dobiva krivu poruku.'],
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

  it('prints every note under its own heading', async () => {
    const html = await renderEmail()
    expect(html).toContain('Na popisu upita stoji oznaka')
    expect(html).toContain('Roditelj koji je odabrao termin')
    expect(html).toContain('Novo')
    expect(html).toContain('Ispravljeno')
  })

  it('omits a heading with nothing under it', async () => {
    // `changed` is unset here, so "Poboljšano" must not appear at all — a bare
    // heading reads as a dropped line rather than an absent group.
    expect(await renderEmail()).not.toContain('Poboljšano')
  })

  it('does not close with the association’s own contact card', async () => {
    const html = await renderEmail()
    expect(html).not.toContain('prijave.sibenik@udruga-inovatic.hr')
    expect(html).not.toContain('S poštovanjem')
  })
})
