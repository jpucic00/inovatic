import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth-guard'
import { getLocations } from '@/actions/admin/location'
import { LocationTable } from '@/components/admin/locations/location-table'
import { CreateLocationDialog } from '@/components/admin/locations/create-location-dialog'

export const metadata: Metadata = { title: 'Admin – Lokacije' }

export default async function LocationsPage() {
  await requireAdmin()

  const locations = await getLocations()

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lokacije</h1>
          <p className="text-gray-500 text-sm mt-1">
            {locations.length === 1 ? '1 lokacija' : `${locations.length} lokacija`}
          </p>
        </div>
        <CreateLocationDialog />
      </div>

      <LocationTable data={locations} />
    </div>
  )
}
