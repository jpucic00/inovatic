/**
 * Admin-driven student password reset — the only way to make a
 * historically-imported account loggable-into. Those rows are created with an
 * unusable 24-char hash and no `plainPassword` (src/lib/import-history/apply.ts),
 * so the reset must produce credentials that actually authenticate, not just a
 * string in the UI.
 */
import { describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createStudent, createTeacher } from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Same notFound() stub the sibling city-scoping suites use, so a 404 surfaces
// as a readable 'NEXT_NOT_FOUND' instead of Next's internal digest string.
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    notFound: vi.fn(() => {
      const err = new Error('NEXT_NOT_FOUND')
      ;(err as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
      throw err
    }),
  }
})

// Imported after the mocks so the action picks up the stubbed notFound.
const { resetStudentPassword } = await import('@/actions/admin/student')

async function adminSession(city: 'SPLIT' | 'SIBENIK') {
  const admin = await createAdmin({ city })
  mockSession({ id: admin.id, role: 'ADMIN', city })
  return admin
}

/** Imported-style row: real username, unusable hash, no readable password. */
async function createImportedStudent(city: 'SPLIT' | 'SIBENIK' = 'SPLIT') {
  const student = await createStudent({ city })
  return db.user.update({
    where: { id: student.id },
    data: { passwordHash: await bcrypt.hash('unusable-24-char-secret', 12), plainPassword: null },
  })
}

describe('resetStudentPassword', () => {
  it('gives an imported account credentials that actually authenticate', async () => {
    await adminSession('SPLIT')
    const student = await createImportedStudent('SPLIT')

    const res = await resetStudentPassword(student.id)
    expect(res.success).toBe(true)
    if (!res.success) throw new Error('unreachable')

    const row = await db.user.findUnique({ where: { id: student.id } })
    // Shown password, stored password, and the hash all agree — the child can
    // log in with the username already on the row.
    expect(row?.plainPassword).toBe(res.password)
    expect(row?.username).toBe(student.username)
    expect(await bcrypt.compare(res.password, row!.passwordHash)).toBe(true)
    expect(row?.passwordHash).not.toBe(student.passwordHash)
  })

  it('invalidates the previous password on an already-usable account', async () => {
    await adminSession('SPLIT')
    const student = await createStudent({ city: 'SPLIT', password: 'old-password' })

    const res = await resetStudentPassword(student.id)
    expect(res.success).toBe(true)
    if (!res.success) throw new Error('unreachable')

    const row = await db.user.findUnique({ where: { id: student.id } })
    expect(await bcrypt.compare('old-password', row!.passwordHash)).toBe(false)
    expect(await bcrypt.compare(res.password, row!.passwordHash)).toBe(true)
  })

  it('404s across the city boundary and leaves the foreign hash untouched', async () => {
    const splitStudent = await createStudent({ city: 'SPLIT' })
    await adminSession('SIBENIK')

    await expect(resetStudentPassword(splitStudent.id)).rejects.toThrow('NEXT_NOT_FOUND')

    const untouched = await db.user.findUnique({ where: { id: splitStudent.id } })
    expect(untouched?.passwordHash).toBe(splitStudent.passwordHash)
    expect(untouched?.plainPassword).toBeNull()
  })

  it('404s on a same-city teacher id — the student path is role-narrowed', async () => {
    await adminSession('SPLIT')
    const teacher = await createTeacher({ city: 'SPLIT' })

    await expect(resetStudentPassword(teacher.id)).rejects.toThrow('NEXT_NOT_FOUND')

    const untouched = await db.user.findUnique({ where: { id: teacher.id } })
    expect(untouched?.passwordHash).toBe(teacher.passwordHash)
  })

  it('rejects an empty id without touching the DB', async () => {
    await adminSession('SPLIT')
    const res = await resetStudentPassword('')
    expect(res.success).toBe(false)
  })
})
