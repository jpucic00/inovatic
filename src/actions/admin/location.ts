'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createLocationSchema, updateLocationSchema } from '@/lib/validators/admin/location'
import type { CreateLocationInput, UpdateLocationInput } from '@/lib/validators/admin/location'
import type { AdminActionResult } from '@/lib/action-types'

export async function getLocations() {
  await requireAdmin()
  return db.location.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { scheduledGroups: true } },
    },
  })
}

export async function createLocation(data: CreateLocationInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = createLocationSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { name, address, phone, email, lat, lng } = parsed.data

  try {
    await db.location.create({
      data: {
        name,
        address,
        phone: phone || null,
        email: email || null,
        lat: lat ?? null,
        lng: lng ?? null,
        isActive: true,
      },
    })
  } catch (err) {
    console.error('createLocation failed:', err)
    return { success: false, error: 'Greška pri kreiranju lokacije.' }
  }

  revalidatePath('/admin/lokacije')
  return { success: true }
}

export async function updateLocation(data: UpdateLocationInput): Promise<AdminActionResult> {
  await requireAdmin()

  const parsed = updateLocationSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Nevaljani podaci.' }

  const { id, ...rest } = parsed.data

  try {
    await db.location.update({
      where: { id },
      data: {
        ...rest,
        phone: rest.phone || null,
        email: rest.email || null,
      },
    })
  } catch (err) {
    console.error('updateLocation failed:', err)
    return { success: false, error: 'Greška pri ažuriranju lokacije.' }
  }

  revalidatePath('/admin/lokacije')
  return { success: true }
}

export async function toggleLocationActive(id: string): Promise<AdminActionResult> {
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    const location = await db.location.findUnique({ where: { id } })
    if (!location) return { success: false, error: 'Lokacija nije pronađena.' }

    await db.location.update({ where: { id }, data: { isActive: !location.isActive } })
  } catch (err) {
    console.error('toggleLocationActive failed:', err)
    return { success: false, error: 'Greška pri ažuriranju lokacije.' }
  }

  revalidatePath('/admin/lokacije')
  return { success: true }
}
