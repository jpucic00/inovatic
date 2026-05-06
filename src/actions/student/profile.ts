'use server'

import { db } from '@/lib/db'
import { requireStudent } from '@/lib/auth-guard'

export type StudentProfile = {
  firstName: string
  lastName: string
  email: string
  username: string | null
  phone: string | null
  dateOfBirth: string | null
  childSchool: string | null
  parentName: string | null
  parentEmail: string | null
  parentPhone: string | null
}

export async function getMyProfile(): Promise<StudentProfile> {
  const session = await requireStudent()

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      username: true,
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
