'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPin, Trash2 } from 'lucide-react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { deleteLocation } from '@/actions/admin/location'

type Location = {
  id: string
  name: string
  address: string
  phone: string | null
  email: string | null
  _count: { scheduledGroups: number }
}

interface LocationTableProps {
  data: Location[]
}

function DeleteLocationButton({ location }: Readonly<{ location: Location }>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteLocation(location.id)
      if (result.success) {
        toast.success('Lokacija obrisana.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
        title="Obriši lokaciju"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Obriši
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Obriši lokaciju</DialogTitle>
            <DialogDescription>
              Jeste li sigurni da želite obrisati lokaciju{' '}
              <span className="font-medium text-gray-900">{location.name}</span>?
              {location._count.scheduledGroups > 0 && (
                <span className="block mt-2 text-amber-600">
                  Lokacija ima {location._count.scheduledGroups} pridruženih grupa i ne može se obrisati dok se grupe ne premjeste.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Odustani
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Brišem...' : 'Obriši'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
    key: 'actions',
    header: '',
    cell: (row) => <DeleteLocationButton location={row} />,
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
