'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTransition, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUSES = [
  { value: 'ALL', label: 'Sve' },
  { value: 'NEW', label: 'Nove' },
  { value: 'SCHEDULE_SENT', label: 'Raspored poslan' },
  { value: 'CONFIRMED', label: 'Potvrđene' },
  { value: 'ACCOUNT_CREATED', label: 'Račun stvoren' },
  { value: 'DECLINED', label: 'Odbijene' },
]

interface InquiryFiltersProps {
  currentStatus: string
  currentSearch: string
}

export function InquiryFilters({ currentStatus, currentSearch }: Readonly<InquiryFiltersProps>) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const searchRef = useRef<HTMLInputElement>(null)

  const pushUrl = (params: { status?: string; search?: string }) => {
    const sp = new URLSearchParams()
    const s = params.status ?? currentStatus
    const q = params.search ?? currentSearch
    if (s && s !== 'ALL') sp.set('status', s)
    if (q) sp.set('search', q)
    // Always reset to page 1 when filters change
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`)
    })
  }

  const handleSearchSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    pushUrl({ search: searchRef.current?.value ?? '' })
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <form onSubmit={handleSearchSubmit} className="relative flex-1 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            ref={searchRef}
            placeholder="Pretraži po imenu roditelja ili djeteta..."
            className="pl-9"
            defaultValue={currentSearch}
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition-colors"
        >
          Traži
        </button>
      </form>

      <div className="flex gap-1 flex-wrap">
        {STATUSES.map((s) => {
          const isActive =
            s.value === 'ALL'
              ? !currentStatus || currentStatus === 'ALL'
              : currentStatus === s.value
          return (
            <button
              key={s.value}
              onClick={() => pushUrl({ status: s.value })}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md border transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
              )}
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
