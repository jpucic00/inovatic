'use client'

import { useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
  backHref: string
  backLabel: string
}

// Shared body of every error.tsx. Most failures here are transient — a database
// waking from idle — so the main action is a retry, not a way out.
export function ErrorState({ error, reset, backHref, backLabel }: Readonly<Props>) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    console.error(error)
  }, [error])

  // reset() alone only re-renders on the client; the failed Server Component
  // payload has to be fetched again, which is what refresh() does.
  function retry() {
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  return (
    <div className="max-w-lg mx-auto text-center py-16 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Nešto je pošlo po zlu</h1>
      <p className="text-gray-500 mb-6">
        Stranicu trenutno nije moguće učitati. Pokušajte ponovno za nekoliko sekundi.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Button onClick={retry} disabled={pending}>
          <RotateCw className={pending ? 'animate-spin' : undefined} />
          Pokušaj ponovno
        </Button>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>
      </div>
      {error.digest && (
        <p className="mt-8 text-xs text-gray-400">Kod greške: {error.digest}</p>
      )}
    </div>
  )
}
