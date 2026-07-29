import { describe, expect, it } from 'vitest'
import { courseLevelLabel, courses, getCourseBySlug } from '@/lib/courses-data'

describe('courses catalog', () => {
  it('opens with the intro program for predškolci, then the four SLR levels', () => {
    expect(courses.map((c) => c.level)).toEqual(['UVOD', 'SLR_1', 'SLR_2', 'SLR_3', 'SLR_4'])
  })

  it('gives predškolci their own 5–6 program on WeDo 2.0', () => {
    const uvod = getCourseBySlug('uvod-u-svijet-lego-robotike')
    expect(uvod?.title).toBe('Uvod u Svijet LEGO robotike')
    expect([uvod?.ageMin, uvod?.ageMax]).toEqual([5, 6])
    expect(uvod?.equipment).toBe('LEGO WeDo 2.0')
    expect(uvod?.modules).toHaveLength(4)
  })

  it('starts SLR 1 at 7 and no longer advertises it to predškolci', () => {
    const slr1 = getCourseBySlug('slr-1')
    expect([slr1?.ageMin, slr1?.ageMax]).toEqual([7, 8])
    expect(slr1?.subtitle).not.toMatch(/predškol/i)
    expect(slr1?.description).not.toMatch(/uključujući i predškolce/i)
  })

  it('states an age range in each subtitle that matches its own age fields', () => {
    for (const c of courses) {
      expect(c.subtitle).toContain(`${c.ageMin} – ${c.ageMax} godina`)
    }
  })

  it('keeps every program on its own image folder and badge', () => {
    for (const c of courses) {
      const folder = `/images/courses/${c.slug}/`
      expect(c.coverImage.startsWith(folder)).toBe(true)
      expect(c.heroBg.startsWith(folder)).toBe(true)
      expect(c.heroRobot.src.startsWith(folder)).toBe(true)
      expect(c.modules.every((m) => m.image.startsWith(folder))).toBe(true)
    }
    expect(new Set(courses.map((c) => c.badge)).size).toBe(courses.length)
  })
})

describe('courseLevelLabel', () => {
  it('labels the intro program as preparatory rather than renumbering the ladder', () => {
    expect(courseLevelLabel(courses[0]!)).toBe('Pripremna razina')
  })

  it('keeps each SLR program on the level its own name claims', () => {
    expect(courses.slice(1).map(courseLevelLabel)).toEqual([
      'Razina 1 od 4',
      'Razina 2 od 4',
      'Razina 3 od 4',
      'Razina 4 od 4',
    ])
  })
})
