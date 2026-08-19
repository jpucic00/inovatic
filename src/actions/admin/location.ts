'use server'

import { db } from '@/lib/db'
import { requireAdminCtx } from '@/lib/auth-guard'
import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { City } from '@prisma/client'
import { createLocationSchema, updateLocationSchema } from '@/lib/validators/admin/location'
import type { CreateLocationInput, UpdateLocationInput } from '@/lib/validators/admin/location'
import type { AdminActionResult } from '@/lib/action-types'
import { adminAction } from '@/lib/admin-action'

// city-guard has no Location helper — the fetch-and-404 stays local to its two
// callers. Deliberately NOT exported: every export from a 'use server' module
// is registered as its own callable Server Action, and publishing a bare
// id-taking guard is exactly what it exists to prevent.
async function assertLocationInCity(id: string, city: City): Promise<void> {
  const location = await db.location.findUnique({
    where: { id },
    select: { city: true },
  })
  // A cross-city id is indistinguishable from a nonexistent one.
  if (location?.city !== city) notFound()
}

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

export async function updateLocation(data: UpdateLocationInput): Promise<AdminActionResult> {
  return adminAction(updateLocationSchema, data, async ({ id, name, address, phone, email }, { city }) => {
    await assertLocationInCity(id, city)

    try {
      await db.location.update({
        where: { id },
        // `city` is absent on purpose — see updateLocationSchema.
        data: {
          name,
          address,
          phone: phone || null,
          email: email || null,
        },
      })
    } catch (err) {
      console.error('updateLocation failed:', err)
      return { success: false, error: 'Greška pri spremanju lokacije.' }
    }

    revalidatePath('/admin/lokacije')
    // A rename shows up wherever a group names its venue.
    revalidatePath('/admin/grupe', 'layout')
    return { success: true }
  })
}

export async function deleteLocation(id: string): Promise<AdminActionResult> {
  const { city } = await requireAdminCtx()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  await assertLocationInCity(id, city)

  try {
    await db.location.delete({ where: { id } })
  } catch {
    return { success: false, error: 'Lokacija se ne može obrisati jer ima pridružene grupe.' }
  }

  revalidatePath('/admin/lokacije')
  return { success: true }
}
