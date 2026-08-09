'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAdminId } from './filter-memory-provider'
import { readFilterMemory } from '@/lib/admin-filter-memory'

interface BackToListLinkProps {
  /** Must match the `listPath` the list page gave `<ListFilterMemory>`. */
  listPath: string
  label: string
}

/**
 * "Natrag na …" that lands on the list the admin actually left, filter and page
 * included.
 *
 * The href starts bare and is upgraded in an effect rather than read during
 * render: the server has no `sessionStorage`, and a link whose markup differed
 * between the two would be a hydration mismatch. Doing it here — instead of
 * letting the list restore the filter after the fact — is what keeps the
 * common path free of the flash of an unfiltered table.
 */
export function BackToListLink({ listPath, label }: Readonly<BackToListLinkProps>) {
  const adminId = useAdminId()
  const [href, setHref] = useState(listPath)

  useEffect(() => {
    const remembered = readFilterMemory(adminId, listPath)
    setHref(remembered ? `${listPath}?${remembered}` : listPath)
  }, [adminId, listPath])

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}
