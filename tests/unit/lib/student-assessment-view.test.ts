import { describe, expect, it } from 'vitest'
import type { StudentDetail } from '@/lib/student-detail'
import { buildGradebookTabs } from '@/lib/student-assessment-view'

// The builder reads only a slice of the Prisma include type — build that slice
// and cast, rather than fabricating every scalar Prisma returns.
function makeStudent(): StudentDetail {
  return {
    id: 'stud1',
    enrollments: [
      {
        schoolYear: '2025/2026',
        scheduledGroup: {
          id: 'g-std',
          name: 'Srijeda',
          dayOfWeek: 'Srijeda',
          course: { title: 'SLR 1', isCustom: false },
          teacherAssignments: [{ user: { firstName: 'Ivano', lastName: 'Tabak' } }],
        },
      },
      {
        schoolYear: '2025/2026',
        scheduledGroup: {
          id: 'g-rad',
          name: 'Radionica X',
          dayOfWeek: null,
          course: { title: 'Robo radionica', isCustom: true },
          teacherAssignments: [],
        },
      },
    ],
    studentComments: [
      {
        id: 'c1',
        content: 'Bilješka radionica',
        createdAt: new Date('2026-01-01'),
        author: { id: 'a1', firstName: 'Ana', lastName: 'A', role: 'TEACHER', deletedAt: null },
        group: {
          id: 'g-rad',
          name: 'Radionica X',
          schoolYear: '2025/2026',
          course: { title: 'Robo radionica' },
        },
      },
      {
        id: 'c2',
        content: 'Stara bilješka',
        createdAt: new Date('2025-01-01'),
        author: { id: 'a2', firstName: 'Boris', lastName: 'B', role: 'ADMIN', deletedAt: null },
        group: {
          id: 'g-old',
          name: 'Petak',
          schoolYear: '2024/2025',
          course: { title: 'SLR 1' },
        },
      },
    ],
    studentAssessments: [
      {
        groupId: 'g-std',
        slaganje: 'OSTVARENO',
        programiranje: 'U_RAZVOJU',
        inovacije: 'OSTVARENO',
        suradnja: 'OSTVARENO',
        komunikacija: null,
        zabava: 'POCETNO',
        opisnaOcjena: 'Odličan napredak',
        recommendationKind: 'COURSE',
        recommendedCourseId: 'c-slr2',
        recommendedCourse: { title: 'SLR 2' },
        updatedAt: new Date('2026-02-02'),
        author: { firstName: 'Ivano', lastName: 'Tabak' },
      },
    ],
  } as unknown as StudentDetail
}

describe('buildGradebookTabs', () => {
  const tabs = buildGradebookTabs(makeStudent(), (authorId) => authorId === 'a1')
  const y2526 = tabs.find((t) => t.schoolYear === '2025/2026')!
  const y2425 = tabs.find((t) => t.schoolYear === '2024/2025')!

  it('groups by school year, newest first', () => {
    expect(tabs.map((t) => t.schoolYear)).toEqual(['2025/2026', '2024/2025'])
  })

  it('standard enrolled group is gradable with its assessment + resolved recommendation title', () => {
    const std = y2526.sections.find((s) => s.groupId === 'g-std')!
    expect(std.canGrade).toBe(true)
    expect(std.canComment).toBe(true)
    expect(std.assessment?.slaganje).toBe('OSTVARENO')
    expect(std.assessment?.recommendedCourseTitle).toBe('SLR 2')
    expect(std.teacherNames).toEqual(['Ivano Tabak'])
  })

  it('radionica group never gets a card but keeps comments', () => {
    const rad = y2526.sections.find((s) => s.groupId === 'g-rad')!
    expect(rad.canGrade).toBe(false)
    expect(rad.canComment).toBe(true)
    expect(rad.assessment).toBeNull()
    expect(rad.comments).toHaveLength(1)
  })

  it('comment-only group (enrollment removed) is read-only: no card, no add-comment', () => {
    const old = y2425.sections.find((s) => s.groupId === 'g-old')!
    expect(old.canGrade).toBe(false)
    expect(old.canComment).toBe(false)
    expect(old.comments).toHaveLength(1)
  })

  it('applies the canDelete predicate per comment author', () => {
    const rad = y2526.sections.find((s) => s.groupId === 'g-rad')!
    expect(rad.comments[0].canDelete).toBe(true) // author a1
    const old = y2425.sections.find((s) => s.groupId === 'g-old')!
    expect(old.comments[0].canDelete).toBe(false) // author a2
  })
})
