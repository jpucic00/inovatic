import { describe, expect, it } from 'vitest'
import { autosaveArticleSchema, slugifyTitle } from '@/lib/validators/admin/article'

describe('autosaveArticleSchema', () => {
  const minimal = {
    id: 'a1',
    title: 'Naslov članka',
    slug: 'naslov-clanka',
    content: [],
  }

  it('accepts a minimal valid payload', () => {
    const result = autosaveArticleSchema.parse(minimal)
    expect(result.slug).toBe('naslov-clanka')
    expect(result.tagNames).toEqual([])
  })

  it('accepts empty title (draft auto-save case)', () => {
    const result = autosaveArticleSchema.parse({ ...minimal, title: '' })
    expect(result.title).toBe('')
  })

  it('rejects uppercase slug', () => {
    const result = autosaveArticleSchema.safeParse({ ...minimal, slug: 'Naslov-Clanka' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('mala slova')
    }
  })

  it('rejects slug with spaces', () => {
    const result = autosaveArticleSchema.safeParse({ ...minimal, slug: 'naslov clanka' })
    expect(result.success).toBe(false)
  })

  it('rejects slug shorter than 2 chars', () => {
    const result = autosaveArticleSchema.safeParse({ ...minimal, slug: 'a' })
    expect(result.success).toBe(false)
  })

  it('rejects slug longer than 120 chars', () => {
    const result = autosaveArticleSchema.safeParse({ ...minimal, slug: 'a'.repeat(121) })
    expect(result.success).toBe(false)
  })

  it('rejects when content is not an array', () => {
    const result = autosaveArticleSchema.safeParse({ ...minimal, content: 'string' })
    expect(result.success).toBe(false)
  })

  it('accepts coverImage as URL or empty string', () => {
    expect(autosaveArticleSchema.parse({ ...minimal, coverImage: '' }).coverImage).toBe('')
    expect(
      autosaveArticleSchema.parse({ ...minimal, coverImage: 'https://example.com/x.png' }).coverImage,
    ).toBe('https://example.com/x.png')
  })

  it('rejects coverImage that is not a URL', () => {
    const result = autosaveArticleSchema.safeParse({ ...minimal, coverImage: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})

describe('slugifyTitle', () => {
  it.each([
    ['Naslov članka', 'naslov-clanka'],
    ['Čaobno žito šuška', 'caobno-zito-suska'],
    ['Đak ide u školu', 'dak-ide-u-skolu'],
    ['Multiple   spaces', 'multiple-spaces'],
    ['  Leading and trailing  ', 'leading-and-trailing'],
    ['punct!?u@a$t#io%n.', 'punctuation'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(slugifyTitle(input)).toBe(expected)
  })

  it('truncates to 100 chars', () => {
    const long = 'a'.repeat(150)
    expect(slugifyTitle(long).length).toBeLessThanOrEqual(100)
  })

  it('strips trailing dashes', () => {
    expect(slugifyTitle('a-')).toBe('a')
    expect(slugifyTitle('-a-')).toBe('a')
  })
})
