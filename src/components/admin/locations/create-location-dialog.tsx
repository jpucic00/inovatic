'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createLocationSchema, type CreateLocationInput } from '@/lib/validators/admin/location'
import { createLocation } from '@/actions/admin/location'

const inputClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

export function CreateLocationDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
  })

  function onSubmit(data: CreateLocationInput) {
    startTransition(async () => {
      const result = await createLocation(data)
      if (result.success) {
        toast.success('Lokacija kreirana.')
        reset()
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Greška.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors">
          <Plus className="w-4 h-4" />
          Nova lokacija
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova lokacija</DialogTitle>
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
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Odustani
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Kreiram...' : 'Kreiraj lokaciju'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
