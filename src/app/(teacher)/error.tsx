'use client'

import { ErrorState } from '@/components/shared/error-state'

export default function TeacherError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <ErrorState error={error} reset={reset} backHref="/nastavnik" backLabel="Natrag na moje grupe" />
}
