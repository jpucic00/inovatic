'use server'

import { db } from '@/lib/db'
import { requirePortalChild } from '@/lib/auth-guard'

type StudentProfile = {
  firstName: string
  lastName: string
  phone: string | null
  dateOfBirth: string | null
  childSchool: string | null
  parentName: string | null
  parentEmail: string | null
  parentPhone: string | null
}

export async function getMyProfile(): Promise<StudentProfile> {
  const { studentId } = await requirePortalChild()

  const user = await db.user.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      dateOfBirth: true,
      childSchool: true,
      parentName: true,
      parentEmail: true,
      parentPhone: true,
    },
  })

  return user
}
