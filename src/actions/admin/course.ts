'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createCourseSchema, updateCourseSchema } from '@/lib/validators/admin/course'
import type { CreateCourseInput, UpdateCourseInput } from '@/lib/validators/admin/course'
import type { AdminActionResult } from '@/lib/action-types'
import { computeSchoolYear } from '@/lib/school-year'

export async function getCourses(schoolYear?: string) {
  await requireAdmin()
  const year = schoolYear ?? computeSchoolYear()

  return db.course.findMany({
    orderBy: [{ isCustom: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      level: true,
      title: true,
      subtitle: true,
      description: true,
      ageMin: true,
      ageMax: true,
      equipment: true,
      price: true,
      imageUrl: true,
      sortOrder: true,
      isCustom: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { scheduledGroups: true } },
      modules: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          schedules: {
            where: { schoolYear: year },
            select: {
              id: true,
              startDate: true,
              endDate: true,
              _count: {
                select: { moduleEnrollments: { where: { status: 'ACTIVE' } } },
              },
            },
          },
        },
      },
    },
  })
}

export async function createCourse(data: CreateCourseInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = createCourseSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { title, description, ageMin, ageMax, price, imageUrl } = parsed.data

  const slug = title
    .toLowerCase()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '')
    .replaceAll(/-+/g, '-')
    .slice(0, 60)

  if (!slug) return { success: false, error: 'Naziv ne može generirati valjan URL slug.' }

  const existing = await db.course.findUnique({ where: { slug } })
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug

  try {
    await db.course.create({
      data: {
        slug: finalSlug,
        title,
        description,
        ageMin,
        ageMax,
        price: price ?? null,
        imageUrl: imageUrl || null,
        isCustom: true,
        sortOrder: 99,
      },
    })
  } catch (err) {
    console.error('createCourse failed:', err)
    return { success: false, error: 'Greška pri kreiranju programa.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

export async function updateCourse(data: UpdateCourseInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateCourseSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, ...rest } = parsed.data

  try {
    await db.course.update({
      where: { id },
      data: {
        ...rest,
        price: rest.price ?? null,
        imageUrl: rest.imageUrl || null,
      },
    })
  } catch (err) {
    console.error('course action failed:', err)
    return { success: false, error: 'Greška pri ažuriranju programa.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

export async function deleteCourse(id: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const course = await db.course.findUnique({ where: { id } })
    if (!course) return { success: false, error: 'Program nije pronađen.' }
    if (!course.isCustom) return { success: false, error: 'Standardni SLR programi se ne mogu brisati.' }

    await db.course.delete({ where: { id } })
  } catch (err) {
    console.error('deleteCourse failed:', err)
    return { success: false, error: 'Greška pri brisanju programa.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

