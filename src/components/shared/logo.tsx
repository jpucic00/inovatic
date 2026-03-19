'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'dark' | 'white'
  className?: string
  href?: string
  size?: 'sm' | 'default'
  onClick?: () => void
}

export function Logo({ variant = 'dark', className, href = '/', size = 'default', onClick }: Readonly<LogoProps>) {
  const [error, setError] = useState(false)
  const src = variant === 'white' ? '/images/logo_white.png' : '/images/logo_dark.png'

  const intrinsic = variant === 'white' ? { width: 1537, height: 874 } : { width: 701, height: 400 }
  const heightClass = size === 'sm' ? 'h-8 w-auto' : 'h-12 w-auto'

  return (
    <Link href={href} className={cn('flex items-center', className)} onClick={onClick}>
      {error ? (
        <span
          className={cn(
            'text-xl font-extrabold tracking-tight',
            variant === 'white' ? 'text-white' : 'text-gray-900',
          )}
        >
          INOVATIC
        </span>
      ) : (
        <Image
          src={src}
          alt="Inovatic – Udruga za robotiku"
          width={intrinsic.width}
          height={intrinsic.height}
          className={heightClass}
          priority={variant === 'dark'}
          onError={() => setError(true)}
        />
      )}
    </Link>
  )
}
