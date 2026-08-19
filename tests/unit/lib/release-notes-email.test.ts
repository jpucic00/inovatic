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
  changes: [
    'Na Upitima stoji oznaka "Ponovni upis" kad dijete već ima račun kod nas.',
    'Roditelj koji je na prijavnici odabrao termin više ne dobiva krivu poruku.',
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

  it('prints every note, in the order they were written', async () => {
    const html = await renderEmail()
    const first = html.indexOf('Na Upitima stoji oznaka')
    const second = html.indexOf('Roditelj koji je na prijavnici')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(-1)
    // The list is ordered feature by feature by whoever wrote it, so the
    // template must not sort or group it into a shape of its own.
    expect(first).toBeLessThan(second)
  })

  it('carries no grouping of its own', async () => {
    // One flat list under one heading. The old novo/poboljšano/ispravljeno
    // split forced a single feature into two places whenever it both added and
    // changed something — see the rules in src/lib/releases.ts.
    const html = await renderEmail()
    expect(html).toContain('Što je novo')
    expect(html).not.toContain('Poboljšano')
    expect(html).not.toContain('Ispravljeno')
  })

  it('does not close with the association’s own contact card', async () => {
    const html = await renderEmail()
    expect(html).not.toContain('prijave.sibenik@udruga-inovatic.hr')
    expect(html).not.toContain('S poštovanjem')
  })
})
