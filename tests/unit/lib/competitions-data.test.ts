import { describe, expect, it } from 'vitest'
import {
  competitions,
  getCompetitionBySlug,
  getNextCompetition,
  COMPETITION_ICONS,
  COMPETITION_TONES,
} from '@/lib/competitions-data'
import { WP_REDIRECTS } from '@/lib/wp-redirects'
// Same fixture the E2E redirect spec walks — one list, two levels of coverage.
import wpCompetitionPages from '../../fixtures/wp-competition-pages.json'

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
  // leftover entry for a slug-identical page would permanently shadow its
  // article. Only a page whose slug had to change may carry an entry.
  it('routes every migrated competition page to its article', () => {
    for (const { wp, article } of wpCompetitionPages) {
      if (wp === article) {
        expect(WP_REDIRECTS[wp], `/${wp} must fall through to the article lookup`).toBeUndefined()
      } else {
        expect(WP_REDIRECTS[wp], `/${wp} was renamed and needs an alias`).toBe(`/novosti/${article}`)
      }
    }
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
    for (const { article } of wpCompetitionPages) {
      // CM-liga and WER have no program page of their own — they live in /novosti only
      if (article.startsWith('cm-liga') || article.startsWith('wer-')) continue
      expect(linked.has(article), `${article} is not linked from any competition archive`).toBe(true)
    }
  })
})
