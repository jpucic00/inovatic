'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createCourseSchema } from '@/lib/validators/admin/course'
import type { CreateCourseInput } from '@/lib/validators/admin/course'
import type { AdminActionResult } from '@/lib/action-types'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { archivedYearError } from '@/lib/school-year-guard'

export async function getCourses() {
  const { city } = await requireAdminCtx()
  const year = await getSelectedSchoolYear()

  return db.course.findMany({
    // Standard SLR courses are global (schoolYear/city = null) and always
    // appear. Radionice are year- and city-scoped — only those stamped with
    // the selected year and the admin's own city.
    where: {
      AND: [
        { OR: [{ isCustom: false }, { schoolYear: year }] },
        { OR: [{ city: null }, { city }] },
      ],
    },
    orderBy: [{ isCustom: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
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
      // Shared standard courses have groups in both cities — count own only.
      _count: { select: { scheduledGroups: { where: { city } } } },
      modules: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          schedules: {
            where: { schoolYear: year, city },
            select: {
              id: true,
              startDate: true,
              endDate: true,
              _count: {
                select: { moduleEnrollments: true },
              },
            },
          },
        },
      },
    },
  })
}

export async function createCourse(data: CreateCourseInput): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  const year = await getSelectedSchoolYear()
  const archived = archivedYearError(year)
  if (archived) return archived

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
        schoolYear: year,
        // Radionice are venue-bound: owned by the creating admin's city
        // (standard SLR programs stay city: null = shared catalog).
        city,
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

export async function deleteCourse(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const course = await db.course.findUnique({
      where: { id },
      select: {
        isCustom: true,
        city: true,
        _count: { select: { materials: true } },
        modules: { select: { _count: { select: { materials: true } } } },
      },
    })
    // Cross-city radionice read as nonexistent — same message as a missing id.
    if (!course || (course.city !== null && course.city !== city)) {
      return { success: false, error: 'Program nije pronađen.' }
    }
    if (!course.isCustom) return { success: false, error: 'Standardni SLR programi se ne mogu brisati.' }

    const moduleMaterialCount = course.modules.reduce((sum, m) => sum + m._count.materials, 0)
    if (course._count.materials + moduleMaterialCount > 0) {
      return { success: false, error: 'Program ima materijale koji se moraju obrisati prije brisanja programa.' }
    }

    await db.course.delete({ where: { id } })
  } catch (err) {
    console.error('deleteCourse failed:', err)
    return { success: false, error: 'Greška pri brisanju programa.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

