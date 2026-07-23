import { describe, expect, it } from 'vitest'
import {
  competitions,
  getCompetitionBySlug,
  getNextCompetition,
  COMPETITION_ICONS,
  COMPETITION_TONES,
} from '@/lib/competitions-data'
import { WP_REDIRECTS } from '@/lib/wp-redirects'

/** WP *pages* migrated to articles on 2026-07-23, slugs kept 1:1. */
const MIGRATED_REPORT_SLUGS = [
  '59-natjecanje-mladih-tehnicara-zupanijska-razina',
  '59-natjecanje-mladih-tehnicara-drzavna-razina',
  '60-natjecanje-mladih-tehnicara-zupanijska-razina',
  '60-natjecanje-mladih-tehnicara-drzavna-razina',
  '61-natjecanje-mladih-tehnicara-2018-2019-zupanijska-razina',
  '61-natjecanje-mladih-tehnicara-2018-2019-drzavna-razina',
  '62-natjecanje-mladih-tehnicara-zupanijska-razina',
  'robokup-zupanijsko-2019',
  'robokup-drzavno-2019',
  'robokup-zupanijsko-natjecanje-2020',
  'robokup-2020-drzavna-razina',
  'cm-liga-2016-17',
  'cm-liga-2017-18-pmf-split',
  'cm-liga-2018-19-pmf-split',
  'cm-liga-2019-2020-pmf-split',
  'first-lego-league-2019',
  'first-lego-league-2020',
  'wer-croatian-open',
  'wer-croatian-open-2018',
  'wro-2019',
]

describe('competitions data', () => {
  it('carries the four competition programs on unique slugs', () => {
    const slugs = competitions.map((c) => c.slug)
    expect(slugs).toEqual([
      'first-lego-league',
      'world-robot-olympiad',
      'natjecanje-mladih-tehnicara',
      'robokup',
    ])
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('gives every competition the copy the detail page renders', () => {
    for (const comp of competitions) {
      expect(comp.title, comp.slug).not.toBe('')
      expect(comp.shortTitle, comp.slug).not.toBe('')
      expect(comp.subtitle, comp.slug).not.toBe('')
      expect(comp.description, comp.slug).not.toBe('')
      expect(comp.paragraphs.length, comp.slug).toBeGreaterThan(0)
      expect(COMPETITION_ICONS[comp.slug], `${comp.slug} icon`).toBeDefined()
      expect(COMPETITION_TONES[comp.tone], `${comp.slug} tone`).toBeDefined()
    }
  })

  it('never leaves an archive entry pointing at an empty article slug', () => {
    for (const comp of competitions) {
      for (const entry of comp.archive) {
        expect(entry.label, comp.slug).not.toBe('')
        if (entry.slug !== null) expect(entry.slug, comp.slug).not.toBe('')
      }
    }
  })

  it('sends every external link over https', () => {
    for (const comp of competitions) {
      for (const link of comp.externalLinks) {
        expect(link.url, `${comp.slug} → ${link.label}`).toMatch(/^https:\/\//)
      }
    }
  })
})

describe('getCompetitionBySlug', () => {
  it('resolves a known slug and rejects an unknown one', () => {
    expect(getCompetitionBySlug('robokup')?.title).toBe('Robokup')
    expect(getCompetitionBySlug('ne-postoji')).toBeUndefined()
  })
})

describe('getNextCompetition', () => {
  it('walks the list in order and wraps back to the first', () => {
    expect(getNextCompetition('first-lego-league')?.slug).toBe('world-robot-olympiad')
    expect(getNextCompetition('natjecanje-mladih-tehnicara')?.slug).toBe('robokup')
    expect(getNextCompetition('robokup')?.slug).toBe('first-lego-league')
  })

  it('never returns the competition you are already on', () => {
    for (const comp of competitions) {
      expect(getNextCompetition(comp.slug)?.slug, comp.slug).not.toBe(comp.slug)
    }
  })

  it('returns undefined for an unknown slug', () => {
    expect(getNextCompetition('ne-postoji')).toBeUndefined()
  })
})

describe('legacy WordPress competition redirects', () => {
  it('points every /natjecanja/{slug} target at a competition that exists', () => {
    const targets = Object.values(WP_REDIRECTS).filter((t) => t.startsWith('/natjecanja/'))
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      const slug = target.slice('/natjecanja/'.length)
      expect(getCompetitionBySlug(slug), `${target} has no competition`).toBeDefined()
    }
  })

  it('routes the two migrated WP pages to their own detail page', () => {
    expect(WP_REDIRECTS['natjecanje-mladih-tehnicara']).toBe('/natjecanja/natjecanje-mladih-tehnicara')
    expect(WP_REDIRECTS['robokup']).toBe('/natjecanja/robokup')
  })

  // The root [slug] route reads WP_REDIRECTS *before* the article lookup, so a
  // leftover entry for a migrated page would permanently shadow its article.
  it('leaves every migrated report page out of the map', () => {
    for (const slug of MIGRATED_REPORT_SLUGS) {
      expect(WP_REDIRECTS[slug], `${slug} must fall through to the article lookup`).toBeUndefined()
    }
  })

  it('aliases the one renamed auto-slug straight to its article', () => {
    expect(WP_REDIRECTS['2069-2']).toBe('/novosti/62-natjecanje-mladih-tehnicara-zupanijska-razina')
  })

  it('keeps the two un-migrated program descriptions pointing at the hub', () => {
    expect(WP_REDIRECTS['croatian-makers-liga']).toBe('/natjecanja')
    expect(WP_REDIRECTS['wer-croatian-open-2']).toBe('/natjecanja')
  })
})

describe('competition archive links', () => {
  it('points every archive entry at a distinct, well-formed article slug', () => {
    const linked = competitions.flatMap((c) => c.archive.filter((e) => e.slug !== null))
    for (const entry of linked) {
      expect(entry.slug, entry.label).toMatch(/^[a-z0-9-]+$/)
    }
    const slugs = linked.map((e) => e.slug)
    expect(new Set(slugs).size, 'an article is linked from two archive rows').toBe(slugs.length)
  })

  it('links every migrated report from its program page', () => {
    const linked = new Set(competitions.flatMap((c) => c.archive.map((e) => e.slug)))
    for (const slug of MIGRATED_REPORT_SLUGS) {
      // CM-liga galleries have no program page of their own — they live in /novosti only
      if (slug.startsWith('cm-liga') || slug.startsWith('wer-')) continue
      expect(linked.has(slug), `${slug} is not linked from any competition archive`).toBe(true)
    }
  })
})
