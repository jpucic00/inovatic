'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'
import { useAdminId } from './filter-memory-provider'
import {
  readFilterMemory,
  withoutFilterParam,
  writeFilterMemory,
} from '@/lib/admin-filter-memory'

export interface ActiveFilterChip {
  /** The URL param this chip stands for — its × removes exactly that param. */
  key: string
  label: string
}

interface ListFilterMemoryProps {
  /**
   * Literal path of the list, not `usePathname()`: the detail page's back link
   * has to name the same key from a different route, so the two must agree on a
   * value neither of them derives.
   */
  listPath: string
  /** Resolved to labels by the page — ids mean nothing to the person reading. */
  chips: ActiveFilterChip[]
}

/**
 * Remembers this list's filter and puts it back when the admin returns to a
 * bare URL, and shows what is currently narrowing the table.
 *
 * The bar is not decoration. A remembered filter means the table can open
 * already narrowed without the admin having touched anything this visit, and
 * "three of forty students" is indistinguishable from "the data is missing"
 * unless something on screen says why.
 */
export function ListFilterMemory({ listPath, chips }: Readonly<ListFilterMemoryProps>) {
  const adminId = useAdminId()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const query = searchParams.toString()
  const arrived = useRef(false)

  /**
   * Restores on arrival only, then does nothing but record.
   *
   * The narrow window matters: every filter control on these pages lands on the
   * bare path when the last filter comes off — a select back to "Svi programi",
   * an empty search, the "Svi" tab, the × on a chip. Restoring whenever the
   * query happens to be empty would take all of those away again, and the ones
   * built as plain links or a native GET form have nowhere to announce
   * themselves from. Recording *every* state, empty included, is the other half:
   * a list the admin deliberately cleared has to still be clear tomorrow.
   */
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true
      if (!query) {
        const remembered = readFilterMemory(adminId, listPath)
        if (remembered) {
          startTransition(() => {
            router.replace(`${listPath}?${remembered}`)
          })
          return
        }
      }
    }
    writeFilterMemory(adminId, listPath, query)
  }, [adminId, listPath, query, router])

  const navigate = (next: string) => {
    startTransition(() => {
      router.push(next ? `${listPath}?${next}` : listPath)
    })
  }

  // During the restore the URL is still bare and the chips still empty; every
  // other transition here starts from a query that is already set.
  if (isPending && !query) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500">
        <Filter className="h-4 w-4 shrink-0 animate-pulse" />
        Vraćam zadnji filter…
      </div>
    )
  }

  if (chips.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
        <Filter className="h-4 w-4 shrink-0" />
        Filter aktivan:
      </span>

      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white py-0.5 pl-2.5 pr-1 text-xs text-amber-900"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => navigate(withoutFilterParam(query, chip.key))}
            aria-label={`Ukloni filter: ${chip.label}`}
            className="rounded-full p-0.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-900"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => navigate('')}
        className="ml-auto text-xs font-medium text-amber-800 underline underline-offset-2 transition-colors hover:text-amber-950"
      >
        Očisti sve
      </button>
    </div>
  )
}
