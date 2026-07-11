import { describe, expect, it } from 'vitest'
import { createCommentSchema } from '@/lib/validators/admin/student-comment'

const minimal = {
  studentId: 's1',
  groupId: 'g1',
  content: 'Test comment',
}

describe('createCommentSchema', () => {
  it('accepts a minimal valid comment', () => {
    const result = createCommentSchema.parse(minimal)
    expect(result.content).toBe('Test comment')
  })

  it('rejects empty content', () => {
    expect(createCommentSchema.safeParse({ ...minimal, content: '' }).success).toBe(false)
  })

  it('rejects content longer than 2000 chars', () => {
    expect(
      createCommentSchema.safeParse({ ...minimal, content: 'x'.repeat(2001) }).success,
    ).toBe(false)
  })

  it('rejects empty studentId', () => {
    expect(createCommentSchema.safeParse({ ...minimal, studentId: '' }).success).toBe(false)
  })

  it('rejects empty groupId', () => {
    expect(createCommentSchema.safeParse({ ...minimal, groupId: '' }).success).toBe(false)
  })

  it('accepts content exactly at 2000 char boundary', () => {
    const result = createCommentSchema.parse({ ...minimal, content: 'x'.repeat(2000) })
    expect(result.content.length).toBe(2000)
  })
})
