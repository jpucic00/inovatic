'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Pencil, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createLocationSchema, type CreateLocationInput } from '@/lib/validators/admin/location'
import { createLocation, updateLocation } from '@/actions/admin/location'
import { adminInputClass as inputClass } from '@/lib/admin-styles'

type EditableLocation = {
  id: string
  name: string
  address: string
  phone: string | null
  email: string | null
}

interface Props {
  /** Omit for a new venue; pass a row to edit that one. */
  location?: EditableLocation
}

function defaultsFor(location?: EditableLocation): CreateLocationInput {
  return {
    name: location?.name ?? '',
    address: location?.address ?? '',
    // '' rather than undefined so clearing an optional field round-trips as
    // "no value" — the action stores NULL for either.
    phone: location?.phone ?? '',
    email: location?.email ?? '',
  }
}

/**
 * One form for both venue create and edit — same fields, same validation. The
 * city is never among them: it comes from the admin's session on create and is
 * untouchable afterwards, since a group's city is FK-bound to its venue's.
 */
export function LocationFormDialog({ location }: Readonly<Props>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const isEdit = location != null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: defaultsFor(location),
  })

  // Reopening starts from the saved row again, so abandoned edits never linger.
  function handleOpenChange(next: boolean) {
    if (next) reset(defaultsFor(location))
    setOpen(next)
  }

  function onSubmit(data: CreateLocationInput) {
    startTransition(async () => {
      const result = isEdit
        ? await updateLocation({ ...data, id: location.id })
        : await createLocation(data)

      if (result.success) {
        toast.success(isEdit ? 'Spremljeno.' : 'Lokacija kreirana.')
        if (!isEdit) reset(defaultsFor())
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  let submitLabel: string
  if (isEdit) {
    submitLabel = isPending ? 'Spremam...' : 'Spremi'
  } else {
    submitLabel = isPending ? 'Kreiram...' : 'Kreiraj lokaciju'
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button
            title="Uredi lokaciju"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Uredi
          </button>
        ) : (
          <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
            <Plus className="w-4 h-4" />
            Nova lokacija
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Uredi lokaciju' : 'Nova lokacija'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <label htmlFor="loc-name" className="block text-sm font-medium text-gray-700 mb-1">Naziv *</label>
            <input id="loc-name" {...register('name')} className={inputClass} placeholder="npr. OŠ Mertojak" />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="loc-address" className="block text-sm font-medium text-gray-700 mb-1">Adresa *</label>
            <input id="loc-address" {...register('address')} className={inputClass} placeholder="npr. Ulica 1, 21000 Split" />
            {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="loc-phone" className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input id="loc-phone" {...register('phone')} className={inputClass} placeholder="+385..." />
            </div>
            <div>
              <label htmlFor="loc-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="loc-email" {...register('email')} type="email" className={inputClass} />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>
          </div>
          {isEdit && (
            <p className="text-xs text-gray-400">
              Grupe koje se održavaju na ovoj lokaciji ostaju pridružene i nakon promjene naziva.
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
