'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { MaterialAudience, MaterialType } from '@prisma/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createMaterial } from '@/actions/material/crud'
import type { StaffLessonModule } from '@/actions/teacher/materials'
import { formatLessonSessions } from '@/lib/lesson-schedule'
import { formatBytes } from '@/lib/material-display'
import {
  MATERIAL_FILE_ACCEPT,
  classifyMaterialFile,
  titleFromFileName,
} from '@/lib/material-file-type'
import { isAllowedExternalVideoUrl } from '@/lib/validators/material'
import { isRobocampUrl } from '@/lib/robocamp-proxy'
import { uploadMaterialFile } from '@/components/material/upload-material-file'

type Kind = 'FILE' | 'LINK' | 'VIDEO' | 'ROBOCAMP'

const KIND_LABEL: Record<Kind, string> = {
  FILE: 'Datoteka',
  LINK: 'Poveznica',
  VIDEO: 'Video poveznica',
  ROBOCAMP: 'RoboCamp',
}

type UploadedFile = { name: string; url: string; bytes: number; mimeType: string; type: MaterialType }

const inputClass =
  'w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500'

function urlError(kind: Exclude<Kind, 'FILE'>, url: string): string | null {
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) return 'Unesite cijelu adresu, s https://.'
  if (kind === 'VIDEO' && !isAllowedExternalVideoUrl(url)) return 'Poveznica mora biti s YouTubea ili Vimea.'
  if (kind === 'ROBOCAMP' && !isRobocampUrl(url)) return 'Poveznica mora biti s elearning.robocamp.eu.'
  return null
}

/**
 * "Dodaj materijal" on a group's Materijali tab: one modal that asks WHERE the
 * material goes (lesson), FOR WHOM (teachers or this group's children) and
 * WHAT it is. The tab itself stays a read-and-present view — teachers open it
 * to download and show materials, and adding one is the rare case (owner,
 * 2026-10-10), so it does not get drop zones on every lesson.
 *
 * The audience has no default on purpose: "za polaznike" publishes to this
 * group's parents, and that must be a choice, not a leftover.
 */
export function AddGroupMaterialDialog({
  groupId,
  modules,
  defaultLessonId,
  competition,
}: Readonly<{
  groupId: string
  modules: readonly StaffLessonModule[]
  /** The lesson being taught or prepared — preselected. */
  defaultLessonId: string | null
  competition: boolean
}>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [lessonId, setLessonId] = useState(defaultLessonId ?? '')
  const [audience, setAudience] = useState<MaterialAudience | null>(null)
  const [kind, setKind] = useState<Kind>('FILE')
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<UploadedFile | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const reset = () => {
    setLessonId(defaultLessonId ?? '')
    setAudience(null)
    setKind('FILE')
    setTitle('')
    setTitleTouched(false)
    setDescription('')
    setUrl('')
    setFile(null)
    setProgress(null)
    setFileError(null)
  }

  // RoboCamp guides are for the children only (DB-enforced too).
  const kinds: Kind[] = audience === 'TEACHER' ? ['FILE', 'LINK', 'VIDEO'] : ['FILE', 'LINK', 'VIDEO', 'ROBOCAMP']
  const linkError = kind === 'FILE' ? null : urlError(kind, url.trim())
  const uploading = progress !== null

  const canSave =
    lessonId !== '' &&
    audience !== null &&
    title.trim().length >= 2 &&
    !uploading &&
    (kind === 'FILE' ? file !== null : url.trim() !== '' && linkError === null)

  const pickFile = async (picked: File) => {
    setFileError(null)
    setFile(null)
    const classified = classifyMaterialFile(picked)
    if (!classified.ok) {
      setFileError(classified.error)
      return
    }
    if (!titleTouched) setTitle(titleFromFileName(picked.name))
    setProgress(0)
    const result = await uploadMaterialFile(picked, classified.mimeType, setProgress)
    setProgress(null)
    if (!result.ok) {
      setFileError(result.error)
      return
    }
    setFile({ name: picked.name, ...result.file, type: classified.type })
  }

  const save = () => {
    if (!canSave || audience === null) return
    const content =
      kind === 'FILE' && file
        ? {
            type: file.type,
            fileUrl: file.url,
            fileSize: file.bytes,
            mimeType: file.mimeType,
            externalUrl: null,
          }
        : { type: kind as MaterialType, externalUrl: url.trim(), fileUrl: null, fileSize: null, mimeType: null }

    startTransition(async () => {
      const res = await createMaterial({
        scope: 'GROUP',
        scheduledGroupId: groupId,
        lessonId,
        audience,
        title: title.trim(),
        description: description.trim() || null,
        sortOrder: 0,
        ...content,
      })
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success('Materijal dodan.')
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // An upload in flight would be lost with the dialog.
        if (!next && uploading) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white transition-colors hover:bg-cyan-700 sm:min-h-10"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Dodaj materijal
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dodaj materijal</DialogTitle>
          <DialogDescription>Materijal vrijedi samo za ovu grupu.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* What it is first; where it goes and for whom after. A picked file
              fills the title only while it is still untouched. */}
          <Field label="Naslov" htmlFor="group-material-title">
            <input
              id="group-material-title"
              type="text"
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
              placeholder="npr. Radni list — senzor boje"
              className={inputClass}
            />
          </Field>

          <Field label="Opis (neobavezno)" htmlFor="group-material-description">
            <textarea
              id="group-material-description"
              value={description}
              maxLength={2000}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kratko: čemu služi ili kako se koristi"
              className={inputClass}
            />
          </Field>

          <Field label="Lekcija" htmlFor="group-material-lesson">
            <select
              id="group-material-lesson"
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className={`${inputClass} min-h-11 bg-white sm:min-h-0`}
            >
              <option value="">Odaberite lekciju…</option>
              {modules.map((m) => {
                const options = m.lessons.map((l) => {
                  const sats = l.sessionNumbers.length > 0 ? formatLessonSessions(l.sessionNumbers) : null
                  return (
                    <option key={l.id} value={l.id}>
                      {sats && sats !== l.title ? `${l.title} (${sats})` : l.title}
                    </option>
                  )
                })
                if (m.lessons.length === 0) return null
                // A radionica has one module-less list: no group heading.
                return m.moduleId === null ? (
                  options
                ) : (
                  <optgroup key={m.moduleId} label={m.title ?? (competition ? 'Natjecanje' : 'Modul')}>
                    {options}
                  </optgroup>
                )
              })}
            </select>
          </Field>

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">Za koga</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['TEACHER', 'Za nastavnike', 'Priprema i ono što prezentirate'],
                  ['STUDENT', 'Za polaznike', 'Vide ih djeca i roditelji ove grupe'],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={[
                    'flex min-h-11 cursor-pointer flex-col justify-center rounded-md border px-3 py-2 text-sm transition-colors',
                    audience === value
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="group-material-audience"
                    value={value}
                    checked={audience === value}
                    onChange={() => {
                      setAudience(value)
                      if (value === 'TEACHER' && kind === 'ROBOCAMP') setKind('FILE')
                    }}
                    className="sr-only"
                  />
                  <span className="font-medium">{label}</span>
                  <span className="text-xs text-gray-500">{hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">Vrsta</legend>
            <div className="flex flex-wrap gap-2">
              {kinds.map((k) => (
                <label
                  key={k}
                  className={[
                    'inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm transition-colors sm:min-h-9',
                    kind === k
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="group-material-kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => {
                      setKind(k)
                      setUrl('')
                    }}
                    className="sr-only"
                  />
                  {KIND_LABEL[k]}
                </label>
              ))}
            </div>
          </fieldset>

          {kind === 'FILE' ? (
            <Field label="Datoteka" htmlFor="group-material-file">
              <input
                id="group-material-file"
                type="file"
                accept={MATERIAL_FILE_ACCEPT}
                disabled={uploading}
                onChange={(e) => {
                  const picked = e.target.files?.[0]
                  if (picked) void pickFile(picked)
                }}
                className="block w-full text-sm text-gray-700 file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-cyan-50 file:px-3 file:text-sm file:font-medium file:text-cyan-700 hover:file:bg-cyan-100 sm:file:min-h-9"
              />
              {uploading ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Uploadam… {Math.round((progress ?? 0) * 100)} %
                </p>
              ) : null}
              {file && !uploading ? (
                <p className="mt-2 text-xs text-emerald-700">
                  ✓ {file.name} · {formatBytes(file.bytes)}
                </p>
              ) : null}
              {fileError ? <p className="mt-2 text-xs text-red-600">{fileError}</p> : null}
            </Field>
          ) : (
            <Field label="Adresa" htmlFor="group-material-url">
              <input
                id="group-material-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={kind === 'ROBOCAMP' ? 'https://elearning.robocamp.eu/…' : 'https://…'}
                className={inputClass}
              />
              {linkError ? <p className="mt-1.5 text-xs text-red-600">{linkError}</p> : null}
            </Field>
          )}

        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || isPending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Spremi
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: Readonly<{ label: string; htmlFor: string; children: React.ReactNode }>) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
    </div>
  )
}
