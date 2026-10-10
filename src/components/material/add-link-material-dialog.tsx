'use client'

import { useState } from 'react'
import { Gamepad2, Link2, Loader2, Video } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { isAllowedExternalVideoUrl } from '@/lib/validators/material'
import { isRobocampUrl } from '@/lib/robocamp-proxy'

export type LinkMaterialKind = 'LINK' | 'VIDEO' | 'ROBOCAMP'

export type LinkMaterialContent = { type: LinkMaterialKind; title: string; externalUrl: string }

const COPY: Record<
  LinkMaterialKind,
  { trigger: string; title: string; hint: string; placeholder: string; icon: typeof Link2 }
> = {
  LINK: {
    trigger: 'Poveznica',
    title: 'Dodaj poveznicu',
    hint: 'Vanjska stranica — otvara se u novoj kartici.',
    placeholder: 'https://…',
    icon: Link2,
  },
  VIDEO: {
    trigger: 'Video poveznica',
    title: 'Dodaj video poveznicu',
    hint: 'YouTube ili Vimeo. Video datoteku povucite u polje za datoteke.',
    placeholder: 'https://www.youtube.com/watch?v=…',
    icon: Video,
  },
  ROBOCAMP: {
    trigger: 'RoboCamp',
    title: 'Dodaj RoboCamp vodič',
    hint: 'Interaktivni vodič — poveznica mora biti s elearning.robocamp.eu.',
    placeholder: 'https://elearning.robocamp.eu/…',
    icon: Gamepad2,
  },
}

function urlError(kind: LinkMaterialKind, url: string): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'Unesite cijelu adresu, s https://.'
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'Unesite web adresu (https://…).'
  if (kind === 'VIDEO' && !isAllowedExternalVideoUrl(url)) return 'Poveznica mora biti s YouTubea ili Vimea.'
  if (kind === 'ROBOCAMP' && !isRobocampUrl(url)) return 'Poveznica mora biti s elearning.robocamp.eu.'
  return null
}

/**
 * The URL-only half of adding a material: a poveznica, a YouTube/Vimeo video or
 * a RoboCamp guide. Files go through the drop zone instead. Whoever opens it
 * decides what "add" means — create the row now, or stage it with a lesson that
 * does not exist yet — so `onAdd` resolves to whether to close.
 */
export function AddLinkMaterialDialog({
  kind,
  onAdd,
}: Readonly<{ kind: LinkMaterialKind; onAdd: (content: LinkMaterialContent) => Promise<boolean> }>) {
  const copy = COPY[kind]
  const Icon = copy.icon
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [pending, setPending] = useState(false)

  const trimmedUrl = url.trim()
  const error = urlError(kind, trimmedUrl)
  const canSubmit = title.trim().length >= 2 && trimmedUrl.length > 0 && error === null && !pending

  const reset = () => {
    setTitle('')
    setUrl('')
    setPending(false)
  }

  const submit = async () => {
    if (!canSubmit) return
    setPending(true)
    const done = await onAdd({ type: kind, title: title.trim(), externalUrl: trimmedUrl })
    setPending(false)
    if (done) {
      setOpen(false)
      reset()
    }
  }

  const inputClass =
    'w-full h-11 sm:h-10 px-3 text-sm rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-cyan-300 hover:text-cyan-700 transition-colors"
        >
          <Icon className="w-4 h-4" />
          {copy.trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.hint}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div>
            <label htmlFor={`link-material-title-${kind}`} className="block text-sm font-medium text-gray-700 mb-1.5">
              Naslov <span className="text-red-500">*</span>
            </label>
            <input
              id={`link-material-title-${kind}`}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`link-material-url-${kind}`} className="block text-sm font-medium text-gray-700 mb-1.5">
              Adresa <span className="text-red-500">*</span>
            </label>
            <input
              id={`link-material-url-${kind}`}
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={copy.placeholder}
              className={inputClass}
            />
            {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 min-h-11 sm:min-h-10 px-4 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Dodaj
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
