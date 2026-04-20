'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  value: string | null
  onChange: (url: string | null) => void
}

export function CoverImageUpload({ value, onChange }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Odaberite sliku.')
      return
    }
    startTransition(async () => {
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `Upload failed (${res.status})`)
        }
        const data = (await res.json()) as { url: string }
        onChange(data.url)
        toast.success('Slika prenesena.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      }
    })
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (value) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
        <Image
          src={value}
          alt="Naslovna slika"
          width={800}
          height={450}
          className="w-full max-h-72 object-cover"
          unoptimized
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-2 right-2 p-1.5 bg-white/90 border border-gray-200 rounded-md hover:bg-white transition-colors shadow-sm"
          aria-label="Ukloni naslovnu sliku"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    )
  }

  return (
    <label
      htmlFor="cover-image-input"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={[
        'flex flex-col items-center justify-center gap-2 w-full h-40 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
        dragOver
          ? 'border-cyan-500 bg-cyan-50'
          : 'border-gray-300 bg-gray-50 hover:border-gray-400',
        isPending && 'opacity-50 pointer-events-none',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isPending ? (
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      ) : (
        <ImagePlus className="w-6 h-6 text-gray-400" />
      )}
      <span className="text-sm text-gray-600">
        {isPending ? 'Prenosim...' : 'Klikni ili povuci sliku'}
      </span>
      <input
        id="cover-image-input"
        type="file"
        accept="image/*"
        onChange={onInputChange}
        className="hidden"
        disabled={isPending}
      />
    </label>
  )
}
