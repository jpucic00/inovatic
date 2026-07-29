'use server'

import type { Session } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import type { AdminActionResult } from '@/lib/action-types'
import {
  addGalleryImagesSchema,
  type AddGalleryImagesInput,
} from '@/lib/validators/gallery'
import { destroyCloudinaryAssetsByPublicId } from '@/lib/cloudinary-cleanup'
import { isRadionica } from '@/lib/program-kind'
import { archivedYearError } from '@/lib/school-year-guard'

type CreatedGalleryImage = {
  id: string
  url: string
  publicId: string
  width: number | null
  height: number | null
  caption: string | null
  sortOrder: number
  moduleId: string | null
  createdAt: Date
}

async function canManageGroupImages(
  session: Session,
  scheduledGroupId: string,
): Promise<boolean> {
  if (session.user.role === 'ADMIN') {
    // Galleries are per-group hence per-city: tenant-bound admin pass-through.
    const group = await db.scheduledGroup.findUnique({
      where: { id: scheduledGroupId },
      select: { city: true },
    })
    return group !== null && group.city === session.user.city
  }
  if (session.user.role !== 'TEACHER') return false
  const assigned = await db.teacherAssignment.findUnique({
    where: {
      userId_scheduledGroupId: {
        userId: session.user.id,
        scheduledGroupId,
      },
    },
    select: { id: true },
  })
  return assigned !== null
}

function revalidateGalleryPaths(groupId: string) {
  revalidatePath(`/nastavnik/grupa/${groupId}/galerija`)
  revalidatePath(`/portal/grupa/${groupId}/galerija`)
  revalidatePath(`/admin/grupe/${groupId}`)
  revalidatePath('/portal')
}

export async function addGalleryImages(
  input: AddGalleryImagesInput,
): Promise<AdminActionResult & { images?: CreatedGalleryImage[] }> {
  const session = await requireTeacher()

  const parsed = addGalleryImagesSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Nevažeći podaci.',
    }
  }
  const data = parsed.data

  if (!(await canManageGroupImages(session, data.scheduledGroupId))) {
    return { success: false, error: 'Nemate dopuštenje za ovu grupu.' }
  }

  const group = await db.scheduledGroup.findUnique({
    where: { id: data.scheduledGroupId },
    select: {
      id: true,
      schoolYear: true,
      course: {
        select: {
          kind: true,
          modules: { select: { id: true } },
        },
      },
    },
  })
  if (!group) return { success: false, error: 'Grupa nije pronađena.' }

  const blocked = archivedYearError(group.schoolYear)
  if (blocked) return blocked

  if (isRadionica(group.course.kind)) {
    if (data.moduleId !== null) {
      return {
        success: false,
        error: 'Radionica nema module — galerija je grupna.',
      }
    }
  } else {
    if (data.moduleId === null) {
      return { success: false, error: 'Standardni program zahtijeva modul.' }
    }
    const moduleIds = new Set(group.course.modules.map((m) => m.id))
    if (!moduleIds.has(data.moduleId)) {
      return { success: false, error: 'Modul ne pripada ovom programu.' }
    }
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const last = await tx.galleryImage.findFirst({
        where: { scheduledGroupId: data.scheduledGroupId, moduleId: data.moduleId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      const startOrder = (last?.sortOrder ?? -1) + 1

      return Promise.all(
        data.images.map((img, i) =>
          tx.galleryImage.create({
            data: {
              scheduledGroupId: data.scheduledGroupId,
              moduleId: data.moduleId,
              url: img.url,
              publicId: img.publicId,
              width: img.width ?? null,
              height: img.height ?? null,
              caption: img.caption ? img.caption : null,
              sortOrder: startOrder + i,
              uploadedById: session.user.id,
            },
            select: {
              id: true,
              url: true,
              publicId: true,
              width: true,
              height: true,
              caption: true,
              sortOrder: true,
              moduleId: true,
              createdAt: true,
            },
          }),
        ),
      )
    })

    revalidateGalleryPaths(data.scheduledGroupId)
    return { success: true, images: created }
  } catch (err) {
    console.error('addGalleryImages failed:', err)
    return { success: false, error: 'Greška pri dodavanju slika u galeriju.' }
  }
}

export async function removeGalleryImage(id: string): Promise<AdminActionResult> {
  const session = await requireTeacher()
  if (!id) return { success: false, error: 'Nedostaje ID.' }

  const existing = await db.galleryImage.findUnique({
    where: { id },
    select: {
      scheduledGroupId: true,
      publicId: true,
      scheduledGroup: { select: { schoolYear: true } },
    },
  })
  if (!existing) return { success: false, error: 'Slika nije pronađena.' }

  if (!(await canManageGroupImages(session, existing.scheduledGroupId))) {
    return { success: false, error: 'Nemate dopuštenje za ovu grupu.' }
  }

  const blocked = archivedYearError(existing.scheduledGroup.schoolYear)
  if (blocked) return blocked

  try {
    await db.galleryImage.delete({ where: { id } })
    destroyCloudinaryAssetsByPublicId([existing.publicId]).catch((e) =>
      console.error('Failed to destroy gallery image asset:', e),
    )
    revalidateGalleryPaths(existing.scheduledGroupId)
    return { success: true }
  } catch (err) {
    console.error('removeGalleryImage failed:', err)
    return { success: false, error: 'Greška pri brisanju slike.' }
  }
}

