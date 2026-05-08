'use server'

import type { Session } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import type { AdminActionResult } from '@/lib/action-types'
import {
  addGalleryImagesSchema,
  updateGalleryCaptionSchema,
  type AddGalleryImagesInput,
  type UpdateGalleryCaptionInput,
} from '@/lib/validators/gallery'
import { destroyCloudinaryAssetsByPublicId } from '@/lib/cloudinary-url'

export type CreatedGalleryImage = {
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
  if (session.user.role === 'ADMIN') return true
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
      course: {
        select: {
          isCustom: true,
          modules: { select: { id: true } },
        },
      },
    },
  })
  if (!group) return { success: false, error: 'Grupa nije pronađena.' }

  if (group.course.isCustom) {
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
    const last = await db.galleryImage.findFirst({
      where: { scheduledGroupId: data.scheduledGroupId, moduleId: data.moduleId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const startOrder = (last?.sortOrder ?? -1) + 1

    const created = await db.$transaction(
      data.images.map((img, i) =>
        db.galleryImage.create({
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
    select: { scheduledGroupId: true, publicId: true },
  })
  if (!existing) return { success: false, error: 'Slika nije pronađena.' }

  if (!(await canManageGroupImages(session, existing.scheduledGroupId))) {
    return { success: false, error: 'Nemate dopuštenje za ovu grupu.' }
  }

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

export async function reorderGalleryImage(
  id: string,
  direction: 'up' | 'down',
): Promise<AdminActionResult> {
  const session = await requireTeacher()
  if (!id) return { success: false, error: 'Nedostaje ID.' }

  const current = await db.galleryImage.findUnique({
    where: { id },
    select: {
      scheduledGroupId: true,
      moduleId: true,
      sortOrder: true,
    },
  })
  if (!current) return { success: false, error: 'Slika nije pronađena.' }

  if (!(await canManageGroupImages(session, current.scheduledGroupId))) {
    return { success: false, error: 'Nemate dopuštenje za ovu grupu.' }
  }

  try {
    const neighbor = await db.galleryImage.findFirst({
      where: {
        scheduledGroupId: current.scheduledGroupId,
        moduleId: current.moduleId,
        sortOrder:
          direction === 'up'
            ? { lt: current.sortOrder }
            : { gt: current.sortOrder },
      },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
      select: { id: true, sortOrder: true },
    })
    if (!neighbor) return { success: true }

    await db.$transaction([
      db.galleryImage.update({
        where: { id: neighbor.id },
        data: { sortOrder: current.sortOrder },
      }),
      db.galleryImage.update({
        where: { id },
        data: { sortOrder: neighbor.sortOrder },
      }),
    ])

    revalidateGalleryPaths(current.scheduledGroupId)
    return { success: true }
  } catch (err) {
    console.error('reorderGalleryImage failed:', err)
    return { success: false, error: 'Greška pri promjeni redoslijeda.' }
  }
}

export async function updateGalleryCaption(
  input: UpdateGalleryCaptionInput,
): Promise<AdminActionResult> {
  const session = await requireTeacher()

  const parsed = updateGalleryCaptionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Nevažeći podaci.',
    }
  }
  const data = parsed.data

  const existing = await db.galleryImage.findUnique({
    where: { id: data.id },
    select: { scheduledGroupId: true },
  })
  if (!existing) return { success: false, error: 'Slika nije pronađena.' }

  if (!(await canManageGroupImages(session, existing.scheduledGroupId))) {
    return { success: false, error: 'Nemate dopuštenje za ovu grupu.' }
  }

  try {
    await db.galleryImage.update({
      where: { id: data.id },
      data: { caption: data.caption === '' ? null : data.caption },
    })
    revalidateGalleryPaths(existing.scheduledGroupId)
    return { success: true }
  } catch (err) {
    console.error('updateGalleryCaption failed:', err)
    return { success: false, error: 'Greška pri spremanju.' }
  }
}
