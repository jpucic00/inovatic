'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createLocationSchema } from '@/lib/validators/admin/location'
import type { CreateLocationInput } from '@/lib/validators/admin/location'
import type { AdminActionResult } from '@/lib/action-types'
import { adminAction } from '@/lib/admin-action'

export async function getLocations() {
  const { city } = await requireAdminCtx()
  return db.location.findMany({
    where: { city },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { scheduledGroups: true } },
    },
  })
}

export async function createLocation(data: CreateLocationInput): Promise<AdminActionResult> {
  return adminAction(createLocationSchema, data, async ({ name, address, phone, email }, { city }) => {
    try {
      await db.location.create({
        data: {
          name,
          address,
          phone: phone || null,
          email: email || null,
          city,
        },
      })
    } catch (err) {
      console.error('createLocation failed:', err)
      return { success: false, error: 'Greška pri kreiranju lokacije.' }
    }
    revalidatePath('/admin/lokacije')
    return { success: true }
  })
}

export async function deleteLocation(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  // city-guard has no Location helper — inline the fetch-and-404 so a
  // cross-city id is indistinguishable from a nonexistent one.
  const location = await db.location.findUnique({
    where: { id },
    select: { city: true },
  })
  if (!location || location.city !== city) notFound()

  try {
    await db.location.delete({ where: { id } })
  } catch {
    return { success: false, error: 'Lokacija se ne može obrisati jer ima pridružene grupe.' }
  }

  revalidatePath('/admin/lokacije')
  return { success: true }
}
