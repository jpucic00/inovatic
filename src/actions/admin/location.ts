'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { revalidatePath } from 'next/cache'
import { createLocationSchema } from '@/lib/validators/admin/location'
import type { CreateLocationInput } from '@/lib/validators/admin/location'
import type { AdminActionResult } from '@/lib/action-types'
import { adminAction } from '@/lib/admin-action'

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
  return adminAction(createLocationSchema, data, async ({ name, address, phone, email }) => {
    try {
      await db.location.create({
        data: {
          name,
          address,
          phone: phone || null,
          email: email || null,
          // TODO(city PR3): city from admin session
          city: 'SPLIT',
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
  await requireAdmin()

  if (!id) return { success: false, error: 'ID nije pronađen.' }

  try {
    await db.location.delete({ where: { id } })
  } catch {
    return { success: false, error: 'Lokacija se ne može obrisati jer ima pridružene grupe.' }
  }

  revalidatePath('/admin/lokacije')
  return { success: true }
}
