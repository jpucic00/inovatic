import { describe, expect, it, vi } from 'vitest'
import { MaterialScope } from '@prisma/client'
import { db } from '@/lib/db'
import { mockSession } from './setup'
import {
  createAdmin,
  createStudent,
  createInquiry,
  createGroup,
  createMaterial,
} from './helpers/factory'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { deleteStudent } = await import('@/actions/admin/student')

// P3: deleteStudent runs inquiry-detach + user-delete inside one $transaction.
// The inquiry that pointed at the child must be DETACHED (studentId → null,
// preserving the "Ponovni upis" history), never cascade-deleted; and a failure
// on the user delete must roll the detach back.
describe('deleteStudent — atomic detach (P3)', () => {
  it('nulls the inquiry link and deletes the student in one transaction', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const student = await createStudent()
    const inquiry = await createInquiry({ status: 'ACCOUNT_CREATED' })
    await db.inquiry.update({ where: { id: inquiry.id }, data: { studentId: student.id } })

    const res = await deleteStudent(student.id)

    expect(res.success).toBe(true)
    expect(await db.user.count({ where: { id: student.id } })).toBe(0)
    // The inquiry survives with its studentId detached, not cascade-deleted.
    const after = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(after).not.toBeNull()
    expect(after?.studentId).toBeNull()
  })

  it('rolls the inquiry detach back when the user delete fails mid-transaction', async () => {
    const admin = await createAdmin()
    mockSession({ id: admin.id, role: 'ADMIN' })

    const student = await createStudent()
    const inquiry = await createInquiry({ status: 'ACCOUNT_CREATED' })
    await db.inquiry.update({ where: { id: inquiry.id }, data: { studentId: student.id } })

    // Material.uploadedById is a required FK with ON DELETE RESTRICT, so making
    // the student an uploader forces tx.user.delete to throw after the detach.
    const group = await createGroup()
    await createMaterial({
      scope: MaterialScope.GROUP,
      scheduledGroupId: group.id,
      uploadedById: student.id,
    })

    const res = await deleteStudent(student.id)

    expect(res.success).toBe(false)
    // Transaction rolled back: the student still exists AND the inquiry link was
    // NOT left nulled.
    expect(await db.user.count({ where: { id: student.id } })).toBe(1)
    const after = await db.inquiry.findUnique({ where: { id: inquiry.id } })
    expect(after?.studentId).toBe(student.id)
  })
})
