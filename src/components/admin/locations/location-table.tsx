'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { toggleLocationActive } from '@/actions/admin/location'

type Location = {
  id: string
  name: string
  address: string
  phone: string | null
  email: string | null
  isActive: boolean
  _count: { scheduledGroups: number }
}

interface LocationTableProps {
  data: Location[]
}

function ToggleActiveButton({ location }: Readonly<{ location: Location }>) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleToggle = () => {
    startTransition(async () => {
      const result = await toggleLocationActive(location.id)
      if (result.success) {
        toast.success(location.isActive ? 'Lokacija deaktivirana.' : 'Lokacija aktivirana.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={[
        'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border transition-colors disabled:opacity-50',
        location.isActive
          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
          : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200',
      ].join(' ')}
    >
      {location.isActive ? 'Aktivna' : 'Neaktivna'}
    </button>
  )
}

const columns: ColumnDef<Location>[] = [
  {
    key: 'name',
    header: 'Naziv',
    sortable: true,
    cell: (row) => (
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
        <p className="font-medium text-gray-900 text-sm">{row.name}</p>
      </div>
    ),
  },
  {
    key: 'address',
    header: 'Adresa',
    cell: (row) => <span className="text-sm text-gray-600">{row.address}</span>,
  },
  {
    key: 'phone',
    header: 'Telefon',
    cell: (row) => <span className="text-sm text-gray-600">{row.phone ?? '–'}</span>,
  },
  {
    key: 'groups',
    header: 'Grupe',
    cell: (row) => <span className="text-sm text-gray-600">{row._count.scheduledGroups}</span>,
  },
  {
    key: 'isActive',
    header: 'Status',
    cell: (row) => <ToggleActiveButton location={row} />,
  },
]

export function LocationTable({ data }: Readonly<LocationTableProps>) {
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowKey={(row) => row.id}
      emptyMessage="Nema lokacija."
    />
  )
}
