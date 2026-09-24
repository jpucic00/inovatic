'use client'

import { ErrorState } from '@/components/shared/error-state'

export default function RootError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <ErrorState error={error} reset={reset} backHref="/" backLabel="Natrag na početnu" />
}
