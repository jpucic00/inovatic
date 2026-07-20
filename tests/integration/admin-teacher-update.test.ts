import { describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import { createAdmin, createTeacher } from './helpers/factory'

// The admin actions call revalidatePath on success. next/cache is a no-op
// outside a request scope; stub it so the action body runs to completion.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { updateTeacher } = await import('@/actions/admin/teacher')

describe('updateTeacher — email editing', () => {
  it('changes the email and normalizes it to lowercase', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const teacher = await createTeacher({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await updateTeacher({
      id: teacher.id,
      firstName: 'Ivana',
      lastName: 'Novak',
      email: 'NewMail@Example.COM',
      phone: null,
    })

    expect(res).toEqual({ success: true })
    const row = await db.user.findUnique({ where: { id: teacher.id } })
    expect(row?.email).toBe('newmail@example.com')
    expect(row?.firstName).toBe('Ivana')
  })

  it('rejects an email already used by another account and leaves the row intact', async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const other = await createTeacher({ city: 'SPLIT' })
    const teacher = await createTeacher({ city: 'SPLIT' })
    const original = teacher.email
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await updateTeacher({
      id: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: other.email,
      phone: null,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toBe('Korisnik s tim e-mailom već postoji.')
    }
    const row = await db.user.findUnique({ where: { id: teacher.id } })
    expect(row?.email).toBe(original)
  })

  it("allows re-saving the teacher's own email (no self-collision)", async () => {
    const admin = await createAdmin({ city: 'SPLIT' })
    const teacher = await createTeacher({ city: 'SPLIT' })
    mockSession({ id: admin.id, role: 'ADMIN', city: 'SPLIT' })

    const res = await updateTeacher({
      id: teacher.id,
      firstName: 'Novo',
      lastName: 'Ime',
      email: teacher.email,
      phone: null,
    })

    expect(res).toEqual({ success: true })
    const row = await db.user.findUnique({ where: { id: teacher.id } })
    expect(row?.firstName).toBe('Novo')
    expect(row?.email).toBe(teacher.email)
  })
})
