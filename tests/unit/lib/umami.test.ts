import { afterEach, describe, expect, it, vi } from 'vitest'
import { UMAMI_INTERNAL_PATH_PATTERN, trackUmamiEvent } from '@/lib/umami'

const isInternal = (pathname: string) => new RegExp(UMAMI_INTERNAL_PATH_PATTERN).test(pathname)

describe('UMAMI_INTERNAL_PATH_PATTERN', () => {
  it('matches every internal section, with and without deeper segments', () => {
    expect(isInternal('/admin')).toBe(true)
    expect(isInternal('/admin/')).toBe(true)
    expect(isInternal('/admin/grupe/abc')).toBe(true)
    expect(isInternal('/nastavnik')).toBe(true)
    expect(isInternal('/nastavnik/grupa/xyz')).toBe(true)
    expect(isInternal('/portal')).toBe(true)
    expect(isInternal('/portal/grupa/xyz/galerija')).toBe(true)
    expect(isInternal('/prijava')).toBe(true)
    expect(isInternal('/api/group-availability')).toBe(true)
  })

  it('never matches public pages', () => {
    expect(isInternal('/')).toBe(false)
    expect(isInternal('/programi')).toBe(false)
    expect(isInternal('/programi/slr-1')).toBe(false)
    expect(isInternal('/upisi')).toBe(false)
    expect(isInternal('/proslave')).toBe(false)
    expect(isInternal('/radionice/ljetna')).toBe(false)
    expect(isInternal('/novosti')).toBe(false)
    expect(isInternal('/lokacije/sibenik')).toBe(false)
    expect(isInternal('/donacije')).toBe(false)
    expect(isInternal('/o-nama')).toBe(false)
    expect(isInternal('/politika-privatnosti')).toBe(false)
  })

  it('does not match public paths that merely start with an internal prefix', () => {
    expect(isInternal('/administracija')).toBe(false)
    expect(isInternal('/prijava-za-radionicu')).toBe(false)
    expect(isInternal('/apis')).toBe(false)
  })

  it('filters internal URLs after normalization the way the before-send handler does', () => {
    const pathnameOf = (url: string) => new URL(url, 'https://udruga-inovatic.hr').pathname
    expect(isInternal(pathnameOf('/admin/grupe?tab=upiti'))).toBe(true)
    expect(isInternal(pathnameOf('https://udruga-inovatic.hr/portal#top'))).toBe(true)
    expect(isInternal(pathnameOf('/novosti?grad=sibenik'))).toBe(false)
  })
})

describe('trackUmamiEvent', () => {
  afterEach(() => {
    delete window.umami
  })

  it('forwards event name and data to window.umami.track', () => {
    const track = vi.fn()
    window.umami = { track }
    trackUmamiEvent('course-inquiry', { city: 'SPLIT' })
    expect(track).toHaveBeenCalledExactlyOnceWith('course-inquiry', { city: 'SPLIT' })
  })

  it('is a safe no-op when the tracker is not loaded', () => {
    expect(() => trackUmamiEvent('party-inquiry')).not.toThrow()
  })
})
