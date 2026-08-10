'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createCourseSchema, updateCourseSchema } from '@/lib/validators/admin/course'
import type { CreateCourseInput, UpdateCourseInput } from '@/lib/validators/admin/course'
import type { AdminActionResult } from '@/lib/action-types'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { archivedYearError } from '@/lib/school-year-guard'
import { adminAction } from '@/lib/admin-action'
import { isCompetition, isEditableCourse, isStandard } from '@/lib/program-kind'

export async function getCourses() {
  const { city } = await requireAdminCtx()
  const year = await getSelectedSchoolYear()

  return db.course.findMany({
    // Standard SLR courses and the competitive program are global
    // (schoolYear/city = null) and always appear. Radionice are year- and
    // city-scoped — only those stamped with the selected year and the admin's
    // own city.
    where: {
      AND: [
        { OR: [{ kind: { not: 'RADIONICA' } }, { schoolYear: year }] },
        { OR: [{ city: null }, { city }] },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
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
      kind: true,
      createdAt: true,
      updatedAt: true,
      // Shared standard courses have groups in both cities and accumulate them
      // year over year — count only this city's, this year's, so the badge
      // matches the `/admin/grupe` list it links to.
      _count: { select: { scheduledGroups: { where: { city, schoolYear: year } } } },
      // This city's razred rule for the selected year — absent means the
      // program still follows the default ladder. Drives the per-row "Razredi"
      // line and the "razred bez programa" warning on /admin/programi.
      gradeRules: {
        where: { schoolYear: year, city },
        select: { grades: true },
      },
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
        kind: 'RADIONICA',
        // Legacy mirror of `kind` — see the schema note on Course.isCustom.
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

export async function updateCourse(data: UpdateCourseInput): Promise<AdminActionResult> {
  return adminAction(updateCourseSchema, data, async (input, { city }) => {
    const year = await getSelectedSchoolYear()
    const archived = archivedYearError(year)
    if (archived) return archived

    const { id, title, description, ageMin, ageMax, price } = input

    const course = await db.course.findUnique({
      where: { id },
      select: { kind: true, city: true, slug: true },
    })
    // Cross-city radionice read as nonexistent — same message as a missing id.
    if (!course || (course.city !== null && course.city !== city)) {
      return { success: false, error: 'Program nije pronađen.' }
    }
    // Radionice and the competitive program carry association-authored copy;
    // standard SLR copy is shared catalog content mirrored on the public site.
    if (!isEditableCourse(course.kind)) {
      return { success: false, error: 'Standardni SLR programi se ne mogu uređivati.' }
    }

    try {
      await db.course.update({
        where: { id },
        // slug is deliberately left alone: it is the public /radionice/<slug>
        // link admins copy and send to parents, so a rename must not break it.
        data: { title, description, ageMin, ageMax, price: price ?? null },
      })
    } catch (err) {
      console.error('updateCourse failed:', err)
      return { success: false, error: 'Greška pri spremanju programa.' }
    }

    revalidatePath('/admin/programi', 'layout')
    revalidatePath(`/radionice/${course.slug}`)
    return { success: true }
  })
}

// Same blockers deleteGroup enforces — a group carrying any of these must be
// emptied by hand before its radionica can go.
const GROUP_DELETE_BLOCKERS = [
  ['enrollments', 'upisane polaznike'],
  ['assignedInquiries', 'povezane upite'],
  ['preferredInquiries', 'povezane upite'],
  ['materials', 'materijale'],
  ['studentComments', 'komentare'],
  ['studentAssessments', 'ocjene'],
  ['galleryImages', 'slike u galeriji'],
  ['teacherAttendances', 'evidentirane sate rada nastavnika'],
] as const

type GroupDeleteCounts = { name: string | null } & {
  _count: Record<(typeof GROUP_DELETE_BLOCKERS)[number][0], number>
}

function blockedGroupError(groups: GroupDeleteCounts[]): AdminActionResult | null {
  for (const group of groups) {
    const blocker = GROUP_DELETE_BLOCKERS.find(([relation]) => group._count[relation] > 0)
    if (blocker) {
      const label = group.name ? `Grupa "${group.name}"` : 'Grupa'
      return { success: false, error: `${label} ima ${blocker[1]} pa se radionica ne može obrisati.` }
    }
  }
  return null
}

export async function deleteCourse(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const course = await db.course.findUnique({
      where: { id },
      select: {
        kind: true,
        city: true,
        _count: { select: { materials: true } },
        modules: { select: { _count: { select: { materials: true } } } },
        scheduledGroups: {
          select: {
            name: true,
            schoolYear: true,
            _count: {
              select: {
                enrollments: true,
                assignedInquiries: true,
                preferredInquiries: true,
                materials: true,
                studentComments: true,
                studentAssessments: true,
                galleryImages: true,
                teacherAttendances: true,
              },
            },
          },
        },
      },
    })
    // Cross-city radionice read as nonexistent — same message as a missing id.
    if (!course || (course.city !== null && course.city !== city)) {
      return { success: false, error: 'Program nije pronađen.' }
    }
    // Only radionice are deletable: standard SLR is shared catalog content, and
    // the competitive program is a fixture with live monthly billing behind it.
    if (isStandard(course.kind)) {
      return { success: false, error: 'Standardni SLR programi se ne mogu brisati.' }
    }
    if (isCompetition(course.kind)) {
      return { success: false, error: 'Natjecateljski program se ne može brisati.' }
    }

    // `deleteGroup` refuses to touch an archived year, and this path cascade-
    // deletes the very same groups — without the check the two disagree and a
    // read-only year becomes mutable through the radionica.
    for (const group of course.scheduledGroups) {
      const archived = archivedYearError(group.schoolYear)
      if (archived) return archived
    }

    const moduleMaterialCount = course.modules.reduce((sum, m) => sum + m._count.materials, 0)
    if (course._count.materials + moduleMaterialCount > 0) {
      return { success: false, error: 'Program ima materijale koji se moraju obrisati prije brisanja programa.' }
    }

    const blocked = blockedGroupError(course.scheduledGroups)
    if (blocked) return blocked

    // The confirm dialog promises the groups go with the radionica, and
    // ScheduledGroup.course has no onDelete cascade — delete them in the same
    // transaction. Teacher assignments and material hides cascade off the
    // groups; modules and enrollment windows cascade off the course.
    await db.$transaction([
      db.scheduledGroup.deleteMany({ where: { courseId: id } }),
      db.course.delete({ where: { id } }),
    ])
  } catch (err) {
    console.error('deleteCourse failed:', err)
    return { success: false, error: 'Greška pri brisanju programa.' }
  }

  revalidatePath('/admin/programi')
  return { success: true }
}

