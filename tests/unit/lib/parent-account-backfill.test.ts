import { describe, expect, it } from 'vitest'
import {
  planParentBackfill,
  type BackfillAccount,
  type BackfillStudent,
} from '@/lib/parent-account-backfill'
import { splitParentName } from '@/lib/parent-account'

let seq = 0
function student(over: Partial<BackfillStudent> = {}): BackfillStudent {
  seq++
  return {
    id: `s${seq}`,
    firstName: `Dijete${seq}`,
    lastName: 'Anić',
    dateOfBirth: '2016-01-01',
    parentName: 'Ivana Anić',
    parentEmail: 'ivana@x.hr',
    parentAccountId: null,
    city: 'SPLIT',
    createdAt: new Date(2026, 0, seq),
    ...over,
  }
}

function account(over: Partial<BackfillAccount> & { email: string }): BackfillAccount {
  return { id: `a-${over.email}`, role: 'PARENT', deletedAt: null, ...over }
}

describe('planParentBackfill', () => {
  it('puts siblings sharing an address into one family with one new account', () => {
    const a = student()
    const b = student()
    const plan = planParentBackfill([a, b], [])
    expect(plan.families).toHaveLength(1)
    expect(plan.families[0]).toMatchObject({ email: 'ivana@x.hr', accountId: null })
    expect(plan.families[0].childIds.sort()).toEqual([a.id, b.id].sort())
  })

  it('merges addresses that differ only by case, whitespace or an Outlook paste', () => {
    const plan = planParentBackfill(
      [
        student({ parentEmail: ' Ivana@X.hr ' }),
        student({ parentEmail: 'Ivana Anić <ivana@x.hr>' }),
      ],
      [],
    )
    expect(plan.families).toHaveLength(1)
    expect(plan.cleaned).toHaveLength(2)
  })

  it('never touches a child that already has a parent account — re-runs are no-ops', () => {
    const plan = planParentBackfill([student({ parentAccountId: 'p1' })], [])
    expect(plan.families).toEqual([])
    expect(plan.alreadyLinked).toBe(1)
  })

  it('reports a child with no usable address instead of guessing', () => {
    const plan = planParentBackfill(
      [student({ parentEmail: null }), student({ parentEmail: 'not an address' })],
      [],
    )
    expect(plan.families).toEqual([])
    expect(plan.noEmail).toHaveLength(2)
  })

  it('links to an existing parent or staff account rather than creating a second', () => {
    const plan = planParentBackfill(
      [student({ parentEmail: 'ucitelj@x.hr' })],
      [account({ email: 'ucitelj@x.hr', role: 'TEACHER' })],
    )
    expect(plan.families[0]).toMatchObject({ accountId: 'a-ucitelj@x.hr', accountRole: 'TEACHER' })
  })

  it('refuses an address owned by a child, classroom or deleted login', () => {
    const plan = planParentBackfill(
      [
        student({ parentEmail: 'dijete@student.inovatic.local' }),
        student({ parentEmail: 'ucionica@x.hr' }),
        student({ parentEmail: 'bivsi@x.hr' }),
      ],
      [
        account({ email: 'dijete@student.inovatic.local', role: 'STUDENT' }),
        account({ email: 'ucionica@x.hr', role: 'CLASSROOM' }),
        account({ email: 'bivsi@x.hr', role: 'TEACHER', deletedAt: new Date() }),
      ],
    )
    expect(plan.families).toEqual([])
    expect(plan.refused.map((r) => r.email).sort()).toEqual(
      ['bivsi@x.hr', 'dijete@student.inovatic.local', 'ucionica@x.hr'].sort(),
    )
  })

  it('keeps a family whose children live in both cities as one login', () => {
    const plan = planParentBackfill(
      [student({ city: 'SPLIT' }), student({ city: 'SIBENIK' })],
      [],
    )
    expect(plan.families).toHaveLength(1)
    expect(plan.families[0].cities.sort()).toEqual(['SIBENIK', 'SPLIT'])
  })

  it('names a new account after the newest child\'s parent', () => {
    const plan = planParentBackfill(
      [
        student({ parentName: 'Stara Upisnica', createdAt: new Date(2024, 0, 1) }),
        student({ parentName: 'Marko Anić', createdAt: new Date(2026, 0, 1) }),
      ],
      [],
    )
    expect(plan.families[0]).toMatchObject({ firstName: 'Marko', lastName: 'Anić' })
  })
})

describe('splitParentName', () => {
  it('splits on the LAST space, so a double first name stays whole', () => {
    expect(splitParentName('Ana Marija Kovač')).toEqual({ firstName: 'Ana Marija', lastName: 'Kovač' })
  })

  it('handles one word and nothing at all', () => {
    expect(splitParentName('Ivana')).toEqual({ firstName: 'Ivana', lastName: '' })
    expect(splitParentName(null)).toEqual({ firstName: '', lastName: '' })
  })
})
