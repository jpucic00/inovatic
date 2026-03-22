'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface BackButtonProps {
  fallbackHref: string
  label: string
  className?: string
}

export function BackButton({ fallbackHref, label, className }: BackButtonProps) {
  const router = useRouter()

  const handleClick = (e: React.MouseEvent) => {
    if (window.history.length > 1) {
      e.preventDefault()
      router.back()
    }
  }

  return (
    <Link href={fallbackHref} onClick={handleClick} className={className}>
      <ArrowLeft className="w-4 h-4" /> {label}
    </Link>
  )
}
