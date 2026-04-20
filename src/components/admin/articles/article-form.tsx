'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { PartialBlock } from '@blocknote/core'
import { Check, Eye, ExternalLink, Loader2, AlertCircle, SquareArrowOutUpRight } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  autosaveArticle,
  publishArticle,
  unpublishArticle,
} from '@/actions/admin/article'
import { slugifyTitle } from '@/lib/validators/admin/article'
import { extractImageUrls } from '@/lib/blocknote-images'
import type { GalleryImage } from '@/actions/admin/article-gallery'
import { CoverImageUpload } from './cover-image-upload'
import { GalleryManager } from './gallery-manager'
import { TagsCombobox, type TagOption } from './tags-combobox'

// BlockNote is client-only and has sizable CSS. Dynamic import keeps the form
// shell render fast and avoids SSR mismatches.
const BlockNoteEditor = dynamic(
  () => import('./blocknote-editor').then((m) => m.BlockNoteEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-gray-200 bg-gray-50 min-h-[400px] flex items-center justify-center text-sm text-gray-400">
        Učitavam editor...
      </div>
    ),
  },
)

interface InitialArticle {
  id: string
  slug: string
  title: string
  excerpt: string | null
  coverImage: string | null
  content: unknown
  isPublished: boolean
  publishedAt: Date | null
  tags: { tag: { id: string; name: string; slug: string } }[]
  images: GalleryImage[]
}

interface Props {
  initial: InitialArticle
  availableTags: TagOption[]
}

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string }

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DEBOUNCE_MS = 1000

function formatTime(d: Date): string {
  return d.toLocaleTimeString('hr-HR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ArticleForm({ initial, availableTags }: Readonly<Props>) {
  const router = useRouter()

  const [title, setTitle] = useState(initial.title)
  const [slug, setSlug] = useState(initial.slug)
  const [excerpt, setExcerpt] = useState(initial.excerpt ?? '')
  const [coverImage, setCoverImage] = useState<string | null>(initial.coverImage)
  const [isPublished, setIsPublished] = useState(initial.isPublished)
  const [tagNames, setTagNames] = useState<string[]>(
    initial.tags.map((t) => t.tag.name),
  )

  const initialContent = useMemo<PartialBlock[]>(() => {
    return Array.isArray(initial.content) ? (initial.content as PartialBlock[]) : []
  }, [initial.content])
  const [content, setContent] = useState<PartialBlock[]>(initialContent)

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' })
  const [isPublishPending, startPublishTransition] = useTransition()

  // Snapshot of the last successfully-saved payload. Any edit that matches
  // this snapshot is a no-op.
  type Snapshot = {
    title: string
    slug: string
    excerpt: string
    coverImage: string | null
    tagNames: string[]
    contentJson: string
  }
  const makeSnapshot = useCallback(
    (): Snapshot => ({
      title,
      slug,
      excerpt,
      coverImage,
      tagNames,
      contentJson: JSON.stringify(content),
    }),
    [title, slug, excerpt, coverImage, tagNames, content],
  )

  const savedSnapshotRef = useRef<Snapshot>({
    title: initial.title,
    slug: initial.slug,
    excerpt: initial.excerpt ?? '',
    coverImage: initial.coverImage,
    tagNames: initial.tags.map((t) => t.tag.name),
    contentJson: JSON.stringify(initialContent),
  })

  // Tracks the image URL set from the last snapshot; if the next change
  // alters this set, we flush the debounce immediately.
  const savedImageUrlsRef = useRef<Set<string>>(
    new Set([
      ...(initial.coverImage ? [initial.coverImage] : []),
      ...extractImageUrls(initialContent),
    ]),
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const runSave = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const snapshot = makeSnapshot()

    // Avoid racing: if an identical payload was already saved, bail.
    const prev = savedSnapshotRef.current
    if (
      prev.title === snapshot.title &&
      prev.slug === snapshot.slug &&
      prev.excerpt === snapshot.excerpt &&
      prev.coverImage === snapshot.coverImage &&
      prev.contentJson === snapshot.contentJson &&
      prev.tagNames.length === snapshot.tagNames.length &&
      prev.tagNames.every((t, i) => t === snapshot.tagNames[i])
    ) {
      return
    }

    setSaveStatus({ kind: 'saving' })
    const task = (async () => {
      const res = await autosaveArticle({
        id: initial.id,
        title: snapshot.title,
        slug: snapshot.slug,
        excerpt: snapshot.excerpt || null,
        coverImage: snapshot.coverImage || null,
        content: content as unknown[],
        tagNames: snapshot.tagNames,
      })
      if (controller.signal.aborted) return
      if (res.success) {
        savedSnapshotRef.current = snapshot
        savedImageUrlsRef.current = new Set([
          ...(snapshot.coverImage ? [snapshot.coverImage] : []),
          ...extractImageUrls(content),
        ])
        setSaveStatus({ kind: 'saved', at: new Date() })
      } else {
        setSaveStatus({ kind: 'error', message: res.error })
      }
    })()
    inFlightRef.current = task
    try {
      await task
    } finally {
      if (inFlightRef.current === task) inFlightRef.current = null
    }
  }, [content, initial.id, makeSnapshot])

  // Schedule a debounced save. Eager flag flushes immediately.
  const scheduleSave = useCallback(
    (eager = false) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      if (eager) {
        void runSave()
        return
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void runSave()
      }, DEBOUNCE_MS)
    },
    [runSave],
  )

  // Flush any pending debounce + await in-flight save. Used before publishing.
  const flushSave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      await runSave()
    } else if (inFlightRef.current) {
      await inFlightRef.current
    }
  }, [runSave])

  // Watch all editable fields. Skip if nothing differs from the saved snapshot.
  useEffect(() => {
    const snap = makeSnapshot()
    const prev = savedSnapshotRef.current
    const dirty =
      prev.title !== snap.title ||
      prev.slug !== snap.slug ||
      prev.excerpt !== snap.excerpt ||
      prev.coverImage !== snap.coverImage ||
      prev.contentJson !== snap.contentJson ||
      prev.tagNames.length !== snap.tagNames.length ||
      !prev.tagNames.every((t, i) => t === snap.tagNames[i])
    if (!dirty) return

    // Eager save if the image URL set changed, so Cloudinary orphans are
    // cleaned up right away and fresh uploads are recorded immediately.
    const currentImageUrls = new Set([
      ...(snap.coverImage ? [snap.coverImage] : []),
      ...extractImageUrls(content),
    ])
    const prevImageUrls = savedImageUrlsRef.current
    const imagesChanged =
      currentImageUrls.size !== prevImageUrls.size ||
      [...currentImageUrls].some((u) => !prevImageUrls.has(u)) ||
      [...prevImageUrls].some((u) => !currentImageUrls.has(u))

    scheduleSave(imagesChanged)
  }, [makeSnapshot, content, scheduleSave])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const slugValid = SLUG_REGEX.test(slug.trim())
  const titleValid = title.trim().length >= 2

  const handleTitleChange = (value: string) => {
    // Auto-fill slug from title only while slug is still the draft default.
    // Match both old (nacrt-) and new (skica-) draft slug prefixes so
    // auto-slug-from-title still works for articles created before the rename.
    const isDraftSlug = /^(?:nacrt|skica)-[a-f0-9]{8}$/.test(slug)
    setTitle(value)
    if (isDraftSlug) {
      const next = slugifyTitle(value)
      if (next.length >= 2) setSlug(next)
    }
  }

  const handlePublish = () => {
    if (!titleValid) {
      toast.error('Naslov mora imati barem 2 znaka.')
      return
    }
    if (!slugValid || slug.trim().length < 2) {
      toast.error('Slug nije valjan.')
      return
    }
    startPublishTransition(async () => {
      await flushSave()
      const res = await publishArticle(initial.id)
      if (res.success) {
        setIsPublished(true)
        toast.success('Članak objavljen.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const handleUnpublish = () => {
    startPublishTransition(async () => {
      const res = await unpublishArticle(initial.id)
      if (res.success) {
        setIsPublished(false)
        toast.success('Objava povučena.')
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main column */}
        <div className="space-y-5">
          <div>
            <label htmlFor="article-title" className="block text-xs font-medium text-gray-600 mb-1">
              Naslov *
            </label>
            <input
              id="article-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className={`${inputClass} text-base font-medium`}
              placeholder="Naslov članka"
              required
            />
          </div>

          <div>
            <label htmlFor="article-slug" className="block text-xs font-medium text-gray-600 mb-1">
              Slug *
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">/novosti/</span>
              <input
                id="article-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                required
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Samo mala slova, brojevi i crtice.
            </p>
          </div>

          <div>
            <label htmlFor="article-excerpt" className="block text-xs font-medium text-gray-600 mb-1">
              Kratki opis
            </label>
            <textarea
              id="article-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className={`${inputClass} resize-y`}
              rows={3}
              maxLength={500}
              placeholder="Opcionalni sažetak koji se prikazuje u popisu članaka i SEO meta opisu."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sadržaj</label>
            <BlockNoteEditor
              initialContent={initialContent}
              onChange={setContent}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Galerija fotografija
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Prikazuje se ispod sadržaja članka. Možeš ih prenijeti više
              odjednom, promijeniti redoslijed strelicama i ukloniti × gumbom.
            </p>
            <GalleryManager
              articleId={initial.id}
              initialImages={initial.images}
            />
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Objava</h3>

            <div className="flex items-center gap-1.5 text-xs mb-3">
              <SaveStatusIndicator status={saveStatus} onRetry={() => scheduleSave(true)} />
            </div>

            <div className="mb-3 text-sm text-gray-700 flex items-center gap-1.5">
              {isPublished ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-medium">Objavljeno</span>
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-gray-600 font-medium">Skica</span>
                </>
              )}
            </div>

            {initial.publishedAt && (
              <p className="text-xs text-gray-400 mb-3">
                Prvi put objavljeno{' '}
                {new Date(initial.publishedAt).toLocaleDateString('hr-HR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </p>
            )}

            {isPublished ? (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={isPublishPending}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isPublishPending ? 'Radim...' : 'Povuci objavu'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishPending || !titleValid || !slugValid}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isPublishPending ? 'Objavljujem...' : 'Objavi članak'}
              </button>
            )}

            <Link
              href={`/admin/novosti/${initial.id}/pregled`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <SquareArrowOutUpRight className="w-3.5 h-3.5" />
              Pregled
            </Link>

            {isPublished && (
              <Link
                href={`/novosti/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Otvori javnu stranicu
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Naslovna slika</h3>
            <CoverImageUpload value={coverImage} onChange={setCoverImage} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Oznake</h3>
            <TagsCombobox
              availableTags={availableTags}
              selectedNames={tagNames}
              onChange={setTagNames}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function SaveStatusIndicator({
  status,
  onRetry,
}: Readonly<{ status: SaveStatus; onRetry: () => void }>) {
  if (status.kind === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Spremanje...
      </span>
    )
  }
  if (status.kind === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <Check className="w-3 h-3" />
        Spremljeno u {formatTime(status.at)}
      </span>
    )
  }
  if (status.kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600">
        <AlertCircle className="w-3 h-3" />
        {status.message}
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 underline underline-offset-2 hover:text-red-700"
        >
          Pokušaj ponovno
        </button>
      </span>
    )
  }
  return <span className="text-gray-400">Skica</span>
}
