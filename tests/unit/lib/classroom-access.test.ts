import { describe, expect, it } from 'vitest'
import { classroomDisplayName, classroomGroupWhere } from '@/lib/classroom-access'
import { activeSchoolYears } from '@/lib/enrollment-activity'

const AUG_31 = new Date('2026-08-31T12:00:00.000Z')
const SEP_1 = new Date('2026-09-01T12:00:00.000Z')

describe('classroomGroupWhere', () => {
  it('is the caller city and the current school year only', () => {
    expect(classroomGroupWhere('SPLIT', AUG_31)).toEqual({ city: 'SPLIT', schoolYear: '2025/2026' })
    expect(classroomGroupWhere('SIBENIK', SEP_1)).toEqual({ city: 'SIBENIK', schoolYear: '2026/2027' })
  })

  /**
   * Owner decision (2026-09-20): deliberately NARROWER than the login gate. A
   * child enrolled for next year must be able to sign in over the summer; a
   * classroom PC in June must not offer September's groups.
   */
  it('does not include the next year the login gate admits', () => {
    const where = classroomGroupWhere('SPLIT', AUG_31)
    expect(activeSchoolYears(AUG_31)).toContain('2026/2027')
    expect(where.schoolYear).toBe('2025/2026')
  })
})

describe('classroomDisplayName', () => {
  it('names the account by what it is, per city', () => {
    expect(classroomDisplayName('SPLIT')).toBe('Račun za učionicu · Split')
    expect(classroomDisplayName('SIBENIK')).toBe('Račun za učionicu · Šibenik')
  })
})
