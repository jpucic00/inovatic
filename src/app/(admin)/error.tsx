'use client'

import { ErrorState } from '@/components/shared/error-state'

export default function AdminError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <ErrorState error={error} reset={reset} backHref="/admin" backLabel="Natrag na nadzornu ploču" />
}
