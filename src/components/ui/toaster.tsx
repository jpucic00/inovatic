'use client'

import { useEffect } from 'react'
import { Toaster as SonnerToaster, toast } from 'sonner'

export function Toaster() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest('[data-sonner-toast]')) toast.dismiss()
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return (
    <SonnerToaster
      richColors
      position="top-right"
      closeButton
      toastOptions={{ style: { cursor: 'pointer' } }}
    />
  )
}
