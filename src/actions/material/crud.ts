'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireTeacher } from '@/lib/auth-guard'
import type { AdminActionResult } from '@/lib/action-types'
import {
  createMaterialSchema,
  updateMaterialSchema,
  type CreateMaterialInput,
  type UpdateMaterialInput,
} from '@/lib/validators/material'
import { destroyCloudinaryMaterialUrls } from '@/lib/cloudinary-cleanup'
import {
  canManageMaterial,
  materialTarget,
  type CanManageTarget,
} from '@/lib/material-access'

// ─── Scope helpers ─────────────────────────────────────────────────────────

async function validateScopeConsistency(
  data: CreateMaterialInput,
): Promise<AdminActionResult | null> {
  if (data.scope === 'MODULE') {
    const mod = await db.courseModule.findUnique({
      where: { id: data.moduleId },
      select: { course: { select: { isCustom: true } } },
    })
    if (!mod) return { success: false, error: 'Modul nije pronađen.' }
    if (mod.course.isCustom) {
      return { success: false, error: 'Radionica nema module — koristite COURSE razinu.' }
    }
  } else if (data.scope === 'COURSE') {
    const course = await db.course.findUnique({
      where: { id: data.courseId },
      select: { isCustom: true },
    })
    if (!course) return { success: false, error: 'Program nije pronađen.' }
    if (!course.isCustom) {
      return {
        success: false,
        error: 'COURSE razina je samo za radionice. Standardni programi koriste MODULE.',
      }
    }
  }
  return null
}

function scopeToTarget(data: CreateMaterialInput): CanManageTarget {
  if (data.scope === 'MODULE') return { scope: 'MODULE', moduleId: data.moduleId }
  if (data.scope === 'COURSE') return { scope: 'COURSE', courseId: data.courseId }
  return { scope: 'GROUP', scheduledGroupId: data.scheduledGroupId }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createMaterial(
  input: CreateMaterialInput,
): Promise<AdminActionResult> {
  const session = await requireTeacher()

  const parsed = createMaterialSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return {
      success: false,
      error: firstIssue?.message ?? 'Nevažeći podaci.',
    }
  }
  const data = parsed.data

  const scopeError = await validateScopeConsistency(data)
  if (scopeError) return scopeError

  const target = scopeToTarget(data)

  if (!(await canManageMaterial(session, target))) {
    return { success: false, error: 'Nemate dopuštenje za dodavanje ovog materijala.' }
  }

  try {
    await db.material.create({
      data: {
        scope: data.scope,
        moduleId: data.scope === 'MODULE' ? data.moduleId : null,
        courseId: data.scope === 'COURSE' ? data.courseId : null,
        scheduledGroupId: data.scope === 'GROUP' ? data.scheduledGroupId : null,
        title: data.title,
        description: data.description || null,
        type: data.type,
        fileUrl: data.fileUrl || null,
        externalUrl: data.externalUrl || null,
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType || null,
        sortOrder: data.sortOrder ?? 0,
        uploadedById: session.user.id,
      },
    })
    revalidateMaterialPaths()
    return { success: true }
  } catch (err) {
    console.error('createMaterial failed:', err)
    return { success: false, error: 'Greška pri dodavanju materijala.' }
  }
}

// ─── Update ─────────────────────────────────────────────────────────────────

export async function updateMaterial(
  input: UpdateMaterialInput,
): Promise<AdminActionResult> {
  const session = await requireTeacher()

  const parsed = updateMaterialSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Nevažeći podaci.',
    }
  }
  const data = parsed.data
  // Scope + FK fields (scope, moduleId, courseId, scheduledGroupId) are immutable post-create.
  // updateMaterialSchema is .strict() so Zod rejects them above — no need to re-run validateScopeConsistency here.

  const existing = await db.material.findUnique({
    where: { id: data.id },
    select: { scope: true, moduleId: true, courseId: true, scheduledGroupId: true, fileUrl: true },
  })
  if (!existing) return { success: false, error: 'Materijal nije pronađen.' }

  const target = materialTarget(existing)
  if (!target) return { success: false, error: 'Materijal ima neispravnu razinu.' }

  if (!(await canManageMaterial(session, target))) {
    return { success: false, error: 'Nemate dopuštenje za uređivanje ovog materijala.' }
  }

  const replacingFile =
    data.fileUrl !== undefined && data.fileUrl !== null && data.fileUrl !== existing.fileUrl
  const oldFileUrl = existing.fileUrl

  try {
    await db.material.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description === '' ? null : data.description,
        type: data.type,
        fileUrl: data.fileUrl === '' ? null : data.fileUrl,
        externalUrl: data.externalUrl === '' ? null : data.externalUrl,
        fileSize: data.fileSize ?? undefined,
        mimeType: data.mimeType === '' ? null : data.mimeType,
        sortOrder: data.sortOrder,
      },
    })

    if (replacingFile && oldFileUrl) {
      // Best-effort Cloudinary cleanup of the prior asset; don't block.
      destroyCloudinaryMaterialUrls([oldFileUrl]).catch((e) =>
        console.error('Failed to destroy replaced material asset:', e),
      )
    }

    revalidateMaterialPaths()
    return { success: true }
  } catch (err) {
    console.error('updateMaterial failed:', err)
    return { success: false, error: 'Greška pri spremanju.' }
  }
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteMaterial(id: string): Promise<AdminActionResult> {
  const session = await requireTeacher()

  const existing = await db.material.findUnique({
    where: { id },
    select: {
      scope: true,
      moduleId: true,
      courseId: true,
      scheduledGroupId: true,
      fileUrl: true,
    },
  })
  if (!existing) return { success: false, error: 'Materijal nije pronađen.' }

  const target = materialTarget(existing)
  if (!target) return { success: false, error: 'Materijal ima neispravnu razinu.' }
  if (!(await canManageMaterial(session, target))) {
    return { success: false, error: 'Nemate dopuštenje za brisanje ovog materijala.' }
  }

  try {
    await db.material.delete({ where: { id } })
    if (existing.fileUrl) {
      destroyCloudinaryMaterialUrls([existing.fileUrl]).catch((e) =>
        console.error('Failed to destroy material asset:', e),
      )
    }
    revalidateMaterialPaths()
    return { success: true }
  } catch (err) {
    console.error('deleteMaterial failed:', err)
    return { success: false, error: 'Greška pri brisanju.' }
  }
}

// ─── Hide / un-hide MODULE/COURSE material from a specific group ────────────

export async function setMaterialHidden(
  materialId: string,
  scheduledGroupId: string,
  hidden: boolean,
): Promise<AdminActionResult> {
  const session = await requireTeacher()

  // Teacher hiding a material must own the group they're hiding it in.
  if (
    !(await canManageMaterial(session, { scope: 'GROUP', scheduledGroupId }))
  ) {
    return { success: false, error: 'Nemate dopuštenje nad ovom grupom.' }
  }

  const material = await db.material.findUnique({
    where: { id: materialId },
    select: { scope: true },
  })
  if (!material) return { success: false, error: 'Materijal nije pronađen.' }

  // Only MODULE/COURSE materials can be per-group hidden. GROUP materials
  // belong to that group already — editing/deleting them is the right tool.
  if (material.scope === 'GROUP') {
    return { success: false, error: 'GROUP materijal se ne može sakriti — obrišite ga ili uredite.' }
  }

  try {
    if (hidden) {
      await db.materialGroupHide.upsert({
        where: {
          materialId_scheduledGroupId: { materialId, scheduledGroupId },
        },
        create: { materialId, scheduledGroupId },
        update: {},
      })
    } else {
      await db.materialGroupHide
        .delete({
          where: {
            materialId_scheduledGroupId: { materialId, scheduledGroupId },
          },
        })
        .catch(() => {
          // Idempotent: deleting a non-existent row is fine.
        })
    }
    revalidateMaterialPaths()
    return { success: true }
  } catch (err) {
    console.error('setMaterialHidden failed:', err)
    return { success: false, error: 'Greška pri ažuriranju vidljivosti.' }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function revalidateMaterialPaths() {
  revalidatePath('/admin/materijali')
  revalidatePath('/nastavnik/materijali')
  revalidatePath('/nastavnik/grupa', 'layout')
  revalidatePath('/portal/grupa', 'layout')
  revalidatePath('/portal')
}
