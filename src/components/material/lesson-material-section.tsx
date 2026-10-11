'use client'

import {
  useId,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type DragEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import type { City, MaterialAudience, MaterialType } from '@prisma/client'
import { createMaterial } from '@/actions/material/crud'
import { moveMaterialToLesson, setMaterialsAudience } from '@/actions/material/move'
import { displayKindOf, formatBytes, resolveHref } from '@/lib/material-display'
import { croatianPlural } from '@/lib/format'
import {
  MATERIAL_FILE_ACCEPT,
  classifyMaterialFile,
  titleFromFileName,
} from '@/lib/material-file-type'
import { ConfirmDialog, type ConfirmRequest } from '@/components/shared/confirm-dialog'
import { MATERIAL_KIND_LABEL, MATERIAL_KIND_LABEL_CLASS, MaterialKindTile } from './material-kind'
import { EditMaterialDialog } from './edit-material-dialog'
import { DeleteMaterialButton } from './delete-material-button'
import { HideInGroupToggle } from './hide-in-group-toggle'
import { AddLinkMaterialDialog, type LinkMaterialContent } from './add-link-material-dialog'
import { uploadMaterialFile } from './upload-material-file'
import { CityOnlyNote, cityEditNotice, offersCityChoice, type MaterialCityControls } from './city-only-note'
import { MaterialCityAction } from './city-only-dialog'
import type { StaffMaterialRow } from './staff-material-list'

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * A material that is not a row yet: a file on its way to Cloudinary, or —
 * on a lesson that does not exist yet — a finished upload or URL waiting for
 * "Spremi lekciju". `title` is what will be saved.
 */
export type StagedMaterial = {
  key: string
  status: 'uploading' | 'saving' | 'ready' | 'error'
  /** 0..1 while uploading. */
  progress: number
  error: string | null
  /** Original file name, for a dropped file. */
  fileName: string | null
  title: string
  type: MaterialType
  fileUrl: string | null
  externalUrl: string | null
  fileSize: number | null
  mimeType: string | null
}

/** Where a material added on this section is created right away. */
type LessonMaterialCreateTarget =
  | { scope: 'LESSON'; lessonId: string }
  | { scope: 'GROUP'; scheduledGroupId: string; lessonId: string }

type LessonMaterialAdd =
  /** Each added material becomes a row immediately (`createMaterial`). */
  | { mode: 'create'; target: LessonMaterialCreateTarget }
  /**
   * Materials are only collected; the caller saves them with its own form
   * (the "Nova lekcija" page). Pass the `useState` pair — uploads finish out of
   * order, so the section updates through the setter's function form.
   */
  | { mode: 'stage'; staged: StagedMaterial[]; setStaged: Dispatch<SetStateAction<StagedMaterial[]>> }

interface LessonMaterialSectionProps {
  /** Whose materials these are; new ones get this audience. */
  audience: MaterialAudience
  heading: string
  hint?: string
  /** Saved rows of this audience. Per-row `canEdit: false` hides edit/delete/move. */
  rows: StaffMaterialRow[]
  emptyLabel?: string
  /** How new materials are added; `null` = this viewer cannot add here. */
  add: LessonMaterialAdd | null
  /** Offers "Premjesti u polaznike / nastavnike" per row and for a selection. */
  canMoveAudience?: boolean
  /** Other lessons a row may move to ("Premjesti u lekciju…"); empty hides it. */
  moveLessonOptions?: { id: string; label: string }[]
  /**
   * Who sees a material once it is moved to the polaznici — finishes the
   * sentence "… će vidjeti roditelji i djeca ___". Default: every group of the
   * program, which is what a curriculum lesson reaches.
   */
  studentReach?: string
  /** On a group page: shows the hide-in-this-group toggle on curriculum rows. */
  inGroupId?: string | null
  /** Nested under a lesson heading (the group page) the section is an h4. */
  headingLevel?: 2 | 3 | 4
  /**
   * Admin curriculum views of a shared program: offers "Samo za <grad>…" /
   * "Vrati u oba grada" per row. Omitted on group pages and for a radionica.
   */
  cityControls?: MaterialCityControls | null
}

const DEFAULT_STUDENT_REACH = 'u svim grupama ovog programa, u oba grada'

/** "… u svim grupama ovog programa u Splitu" — for a city-limited selection. */
const CITY_LOCATIVE: Record<City, string> = { SPLIT: 'u Splitu', SIBENIK: 'u Šibeniku' }
const SAVE_FAILED = 'Spremanje nije uspjelo. Provjerite vezu i pokušajte ponovno.'

let stagedCounter = 0
const nextKey = () => `staged-${Date.now()}-${++stagedCounter}`

// ─── Section ────────────────────────────────────────────────────────────────

/**
 * One audience's materials inside a lesson: saved rows (with move/edit/delete),
 * a multi-file drop zone, and URL buttons. Shared by the admin lesson editor and
 * a group's lesson view, so nothing in it is admin-only — every permission comes
 * in as a prop and the actions re-check on the server.
 */
export function LessonMaterialSection({
  audience,
  heading,
  hint,
  rows,
  emptyLabel,
  add,
  canMoveAudience = false,
  moveLessonOptions = [],
  studentReach = DEFAULT_STUDENT_REACH,
  inGroupId = null,
  headingLevel = 2,
  cityControls = null,
}: Readonly<LessonMaterialSectionProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  // Create mode keeps its in-flight uploads here; stage mode uses the caller's list.
  const [inFlight, setInFlight] = useState<StagedMaterial[]>([])

  const otherAudience: MaterialAudience = audience === 'TEACHER' ? 'STUDENT' : 'TEACHER'
  const otherLabel = otherAudience === 'STUDENT' ? 'polaznike' : 'nastavnike'

  const canMoveRow = (row: StaffMaterialRow) =>
    canMoveAudience &&
    row.canEdit !== false &&
    (row.scope === 'LESSON' || row.scope === 'GROUP') &&
    // A RoboCamp guide is for the children only — never offered "u nastavnike".
    !(row.type === 'ROBOCAMP' && otherAudience === 'TEACHER')
  const movableRows = rows.filter(canMoveRow)
  // Rows that left (moved, deleted) drop out of the selection by themselves.
  const selectedIds = movableRows.filter((r) => selected.has(r.id)).map((r) => r.id)

  const staged = add?.mode === 'stage' ? add.staged : inFlight
  const setItems: Dispatch<SetStateAction<StagedMaterial[]>> =
    add?.mode === 'stage' ? add.setStaged : setInFlight
  const patchItem = (key: string, patch: Partial<StagedMaterial>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  const removeItem = (key: string) => setItems((prev) => prev.filter((item) => item.key !== key))
  // An upload cannot be aborted, so X on an in-flight row only drops the
  // placeholder. Remembering the key is what stops the finished upload from
  // still being turned into a material nobody sees being published.
  const cancelledKeys = useRef(new Set<string>())
  const cancelItem = (key: string) => {
    cancelledKeys.current.add(key)
    removeItem(key)
  }

  // ── Moving between audiences ──────────────────────────────────────────────

  const runAudienceMove = (materialIds: string[]) => {
    startTransition(async () => {
      const res = await setMaterialsAudience({ materialIds, audience: otherAudience })
      if (res.success) {
        toast.success(
          materialIds.length === 1
            ? `Premješteno u materijale za ${otherLabel}.`
            : `Premješteno ${materialIds.length} materijala u materijale za ${otherLabel}.`,
        )
        setSelected(new Set())
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  /**
   * Into the polaznici asks first: from that moment every family in every
   * group reached by this lesson can open the file. Back to the nastavnici only
   * narrows who sees it, so it goes straight through.
   */
  const requestAudienceMove = (materialIds: string[], firstTitle: string) => {
    if (otherAudience === 'TEACHER') {
      runAudienceMove(materialIds)
      return
    }
    // The default reach says "u oba grada"; a selection limited to one city
    // reaches only that city's families, and the question must not overstate it.
    const cities = new Set(rows.filter((r) => materialIds.includes(r.id)).map((r) => r.city ?? null))
    const [onlyCity] = cities
    const reach =
      studentReach === DEFAULT_STUDENT_REACH && cities.size === 1 && onlyCity
        ? `u svim grupama ovog programa ${CITY_LOCATIVE[onlyCity]}`
        : studentReach
    const what =
      materialIds.length === 1
        ? `„${firstTitle}"`
        : `${materialIds.length} ${croatianPlural(materialIds.length, 'materijal', 'materijala', 'materijala')}`
    setConfirm({
      title: 'Premjestiti u materijale za polaznike?',
      description: `${what} će vidjeti roditelji i djeca ${reach}.`,
      confirmLabel: 'Premjesti u polaznike',
      onConfirm: () => runAudienceMove(materialIds),
    })
  }

  const moveToLesson = (row: StaffMaterialRow, lessonId: string) => {
    const target = moveLessonOptions.find((o) => o.id === lessonId)
    if (!target) return
    startTransition(async () => {
      const res = await moveMaterialToLesson({ materialId: row.id, lessonId })
      if (res.success) {
        toast.success(`„${row.title}" premješten u ${target.label}.`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  // ── Adding ────────────────────────────────────────────────────────────────

  /** Create mode: turns finished content into a row; resolves to success. */
  const createRow = async (content: {
    title: string
    type: MaterialType
    fileUrl: string | null
    externalUrl: string | null
    fileSize: number | null
    mimeType: string | null
  }): Promise<{ success: true } | { success: false; error: string }> => {
    if (add?.mode !== 'create') return { success: false, error: 'Dodavanje nije dostupno.' }
    const common = { ...content, description: null, sortOrder: 0, audience }
    const input =
      add.target.scope === 'LESSON'
        ? { ...common, scope: 'LESSON' as const, lessonId: add.target.lessonId }
        : {
            ...common,
            scope: 'GROUP' as const,
            scheduledGroupId: add.target.scheduledGroupId,
            lessonId: add.target.lessonId,
          }
    return createMaterial(input)
  }

  const addFile = async (file: File) => {
    const classified = classifyMaterialFile(file)
    if (!classified.ok) {
      toast.error(classified.error)
      return
    }
    const key = nextKey()
    setItems((prev) => [
      ...prev,
      {
        key,
        status: 'uploading',
        progress: 0,
        error: null,
        fileName: file.name,
        title: titleFromFileName(file.name),
        type: classified.type,
        fileUrl: null,
        externalUrl: null,
        fileSize: null,
        mimeType: classified.mimeType,
      },
    ])

    const uploaded = await uploadMaterialFile(file, classified.mimeType, (progress) =>
      patchItem(key, { progress }),
    )
    if (cancelledKeys.current.delete(key)) return
    if (!uploaded.ok) {
      patchItem(key, { status: 'error', error: uploaded.error })
      return
    }
    const content = {
      fileUrl: uploaded.file.url,
      fileSize: uploaded.file.bytes,
      mimeType: uploaded.file.mimeType || classified.mimeType,
    }
    if (add?.mode === 'stage') {
      patchItem(key, { ...content, status: 'ready', progress: 1 })
      return
    }

    patchItem(key, { ...content, status: 'saving', progress: 1 })
    const res = await createRow({
      title: titleFromFileName(file.name),
      type: classified.type,
      externalUrl: null,
      ...content,
    }).catch(() => ({ success: false as const, error: SAVE_FAILED }))
    if (!res.success) {
      patchItem(key, { status: 'error', error: res.error })
      return
    }
    // Dropping the placeholder inside the same transition as the refresh means
    // it is replaced by the real row in one paint, not a gap and then the row.
    startTransition(() => {
      router.refresh()
      removeItem(key)
    })
  }

  const addFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) void addFile(file)
  }

  const addLink = async (content: LinkMaterialContent): Promise<boolean> => {
    const full = { ...content, fileUrl: null, fileSize: null, mimeType: null }
    if (add?.mode === 'stage') {
      setItems((prev) => [
        ...prev,
        { ...full, key: nextKey(), status: 'ready', progress: 1, error: null, fileName: null },
      ])
      return true
    }
    const res = await createRow(full).catch(() => ({
      success: false as const,
      error: SAVE_FAILED,
    }))
    if (!res.success) {
      toast.error(res.error)
      return false
    }
    toast.success('Materijal dodan.')
    router.refresh()
    return true
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const nothingYet = rows.length === 0 && staged.length === 0
  const Heading = `h${headingLevel}` as const

  return (
    <section className="space-y-3">
      <div>
        <Heading className="text-base font-semibold text-gray-900">{heading}</Heading>
        {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
      </div>

      {canMoveAudience && selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
          <span className="text-sm text-cyan-900">Odabrano: {selectedIds.length}</span>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              requestAudienceMove(
                selectedIds,
                rows.find((r) => r.id === selectedIds[0])?.title ?? '',
              )
            }
            className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-60"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Premjesti odabrane u {otherLabel}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="min-h-11 sm:min-h-8 px-3 text-sm text-cyan-800 hover:underline"
          >
            Poništi odabir
          </button>
        </div>
      ) : null}

      {nothingYet && !add ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          {emptyLabel ?? 'Još nema materijala.'}
        </p>
      ) : null}

      {rows.length > 0 || staged.length > 0 ? (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {rows.map((row) => (
            <SavedRow
              key={row.id}
              row={row}
              selectable={canMoveRow(row)}
              checked={selected.has(row.id)}
              onCheckedChange={(checked) =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (checked) next.add(row.id)
                  else next.delete(row.id)
                  return next
                })
              }
              moveLabel={canMoveRow(row) ? `Premjesti u ${otherLabel}` : null}
              onMoveAudience={() => requestAudienceMove([row.id], row.title)}
              lessonOptions={row.canEdit === false ? [] : moveLessonOptions}
              onMoveToLesson={(lessonId) => moveToLesson(row, lessonId)}
              inGroupId={inGroupId}
              cityControls={cityControls}
              disabled={isPending}
            />
          ))}
          {staged.map((item) => (
            <StagedRow
              key={item.key}
              item={item}
              editableTitle={add?.mode === 'stage'}
              onTitleChange={(title) => patchItem(item.key, { title })}
              onRemove={() => cancelItem(item.key)}
            />
          ))}
        </ul>
      ) : null}

      {add ? (
        <AddArea
          audience={audience}
          empty={nothingYet}
          emptyLabel={emptyLabel}
          onFiles={addFiles}
          onLink={addLink}
        />
      ) : null}

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </section>
  )
}

// ─── Saved row ──────────────────────────────────────────────────────────────

function SavedRow({
  row,
  selectable,
  checked,
  onCheckedChange,
  moveLabel,
  onMoveAudience,
  lessonOptions,
  onMoveToLesson,
  inGroupId,
  cityControls,
  disabled,
}: Readonly<{
  row: StaffMaterialRow
  selectable: boolean
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  moveLabel: string | null
  onMoveAudience: () => void
  lessonOptions: { id: string; label: string }[]
  onMoveToLesson: (lessonId: string) => void
  inGroupId: string | null
  cityControls: MaterialCityControls | null
  disabled: boolean
}>) {
  const kind = displayKindOf(row)
  const href = resolveHref(row)
  const size = formatBytes(row.fileSize)
  // The other city's "Samo <grad>" row is shown so the drift is visible, but it
  // is theirs: no controls at all, and greyed so it reads as not-ours at a glance.
  const foreign = row.otherCityOnly === true
  const editable = row.canEdit !== false && !foreign
  const hideable = inGroupId !== null && row.scope !== 'GROUP' && !foreign
  const cityChoice = offersCityChoice(row, cityControls)

  return (
    <li
      className={['flex items-start gap-2 px-2 py-3 sm:px-3', row.hiddenInThisGroup ? 'opacity-60' : ''].join(' ')}
      data-foreign-city={foreign ? 'true' : undefined}
    >
      {/* The checkbox column stays even when a row cannot be selected, so the
          tiles line up down the list. */}
      <span className="flex w-8 shrink-0 justify-center self-stretch sm:w-6">
        {selectable ? (
          <label className="flex min-h-11 w-full cursor-pointer items-start justify-center pt-2.5 sm:min-h-0">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onCheckedChange(e.target.checked)}
              className="h-4 w-4 accent-cyan-600"
              aria-label={`Odaberi „${row.title}"`}
            />
          </label>
        ) : null}
      </span>

      <span className={foreign ? 'flex shrink-0 opacity-50' : 'flex shrink-0'}>
        <MaterialKindTile kind={kind} />
      </span>

      <div className="min-w-0 flex-1">
        {/* Only the material itself is dimmed — the "Samo <grad>" note below
            stays at full contrast, since it is the part worth reading. */}
        <div className={foreign ? 'opacity-50' : undefined}>
          {href ? (
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-semibold text-gray-900 hover:text-cyan-700 hover:underline"
            >
              {row.title}
            </Link>
          ) : (
            <span className="block truncate text-sm font-semibold text-gray-900">{row.title}</span>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${MATERIAL_KIND_LABEL_CLASS[kind]}`}>
              {MATERIAL_KIND_LABEL[kind]}
            </span>
            {row.scope === 'GROUP' && row.groupName ? (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                Grupa · {row.groupName}
              </span>
            ) : null}
            {row.hiddenInThisGroup ? (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Sakriveno u grupi
              </span>
            ) : null}
            {size ? <span className="text-xs text-gray-500">{size}</span> : null}
          </div>
          {row.description ? <p className="mt-1 line-clamp-2 text-xs text-gray-500">{row.description}</p> : null}
        </div>
        <CityOnlyNote city={row.city} reason={row.cityOnlyReason} />

        {editable && (moveLabel || lessonOptions.length > 0 || cityChoice) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {moveLabel ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onMoveAudience}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:border-cyan-300 hover:text-cyan-700 disabled:opacity-60 sm:min-h-8"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {moveLabel}
              </button>
            ) : null}
            {lessonOptions.length > 0 ? (
              <select
                value=""
                disabled={disabled}
                onChange={(e) => {
                  if (e.target.value) onMoveToLesson(e.target.value)
                }}
                aria-label={`Premjesti „${row.title}" u drugu lekciju`}
                className="min-h-11 max-w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60 sm:min-h-8"
              >
                <option value="">Premjesti u lekciju…</option>
                {lessonOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : null}
            {cityChoice && cityControls ? (
              <MaterialCityAction
                materialId={row.id}
                title={row.title}
                city={row.city}
                viewerCity={cityControls.viewerCity}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {hideable ? (
          <HideInGroupToggle
            materialId={row.id}
            scheduledGroupId={inGroupId}
            hidden={row.hiddenInThisGroup === true}
          />
        ) : null}
        {editable ? (
          <>
            <EditMaterialDialog
              id={row.id}
              title={row.title}
              description={row.description}
              sortOrder={row.sortOrder}
              type={row.type}
              fileUrl={row.fileUrl}
              fileSize={row.fileSize}
              cityNotice={cityEditNotice(row, cityControls)}
            />
            <DeleteMaterialButton id={row.id} title={row.title} />
          </>
        ) : null}
      </div>
    </li>
  )
}

// ─── Staged / in-flight row ─────────────────────────────────────────────────

function StagedRow({
  item,
  editableTitle,
  onTitleChange,
  onRemove,
}: Readonly<{
  item: StagedMaterial
  editableTitle: boolean
  onTitleChange: (title: string) => void
  onRemove: () => void
}>) {
  const inputId = useId()
  const kind = displayKindOf(item)
  const titleTooShort = item.title.trim().length < 2
  const removable = item.status !== 'saving'

  let status: ReactNode = null
  if (item.status === 'uploading') {
    const percent = Math.round(item.progress * 100)
    status = (
      <div className="mt-1.5 flex items-center gap-2">
        <progress
          max={100}
          value={percent}
          aria-label={`Učitavanje: ${item.fileName ?? item.title}`}
          className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-cyan-500 [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-cyan-500"
        />
        <span className="w-9 text-right text-xs tabular-nums text-gray-500">{percent}%</span>
      </div>
    )
  } else if (item.status === 'saving') {
    status = (
      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Spremam…
      </p>
    )
  } else if (item.status === 'error') {
    status = <p className="mt-1 text-xs text-red-600">{item.error}</p>
  } else {
    const size = formatBytes(item.fileSize)
    status = (
      <p className="mt-1 text-xs text-gray-500">
        {MATERIAL_KIND_LABEL[kind]}
        {size ? ` · ${size}` : ''}
        {item.externalUrl ? ` · ${item.externalUrl}` : ''}
      </p>
    )
  }

  return (
    <li className={['flex items-start gap-2 px-2 py-3 sm:px-3', item.status === 'error' ? 'bg-red-50/50' : 'bg-cyan-50/30'].join(' ')}>
      <span className="w-8 shrink-0 sm:w-6" />
      <MaterialKindTile kind={kind} />
      <div className="min-w-0 flex-1">
        {editableTitle && item.status !== 'error' ? (
          <>
            <label htmlFor={inputId} className="sr-only">
              Naslov materijala
            </label>
            <input
              id={inputId}
              type="text"
              value={item.title}
              maxLength={200}
              onChange={(e) => onTitleChange(e.target.value)}
              className={[
                'h-11 w-full rounded-md border px-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:h-9',
                titleTooShort ? 'border-red-300' : 'border-gray-200',
              ].join(' ')}
            />
            {titleTooShort ? (
              <p className="mt-1 text-xs text-red-600">Naslov mora imati barem 2 znaka.</p>
            ) : null}
          </>
        ) : (
          <span className="block truncate text-sm font-semibold text-gray-900">{item.title}</span>
        )}
        {item.fileName && editableTitle ? (
          <p className="mt-0.5 truncate text-[11px] text-gray-400">{item.fileName}</p>
        ) : null}
        {status}
      </div>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Ukloni „${item.title}"`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-red-700 sm:h-8 sm:w-8"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  )
}

// ─── Drop zone + URL buttons ────────────────────────────────────────────────

function AddArea({
  audience,
  empty,
  emptyLabel,
  onFiles,
  onLink,
}: Readonly<{
  audience: MaterialAudience
  empty: boolean
  emptyLabel?: string
  onFiles: (files: FileList | File[]) => void
  onLink: (content: LinkMaterialContent) => Promise<boolean>
}>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [dragging, setDragging] = useState(false)

  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }
  const onDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    // Leaving into a child (the button, the text) is not leaving the zone.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragging(false)
  }
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      {/* A label for the file input, so the drop zone is a native control
          (Sonar S6848) and a click anywhere on it opens the picker. The button
          stays as the keyboard path; a click on it does not re-trigger the label. */}
      <label
        htmlFor={inputId}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          'block cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
          dragging ? 'border-cyan-500 bg-cyan-50' : 'border-gray-300 bg-white',
        ].join(' ')}
      >
        {empty && emptyLabel ? <span className="mb-2 block text-sm text-gray-500">{emptyLabel}</span> : null}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700 sm:min-h-10"
        >
          <Upload className="h-4 w-4" />
          Odaberi datoteke
        </button>
        <span className="mt-2 block text-xs text-gray-500">
          <span className="hidden sm:inline">ili ih povucite ovamo · </span>{' '}
          PDF, Word, PowerPoint, slike, video · do 50 MB po datoteci
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple
          accept={MATERIAL_FILE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onFiles(Array.from(e.target.files))
            // Picking the same file again must fire `change` again.
            e.target.value = ''
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <AddLinkMaterialDialog kind="LINK" onAdd={onLink} />
        <AddLinkMaterialDialog kind="VIDEO" onAdd={onLink} />
        {/* RoboCamp guides are for the children only (DB-enforced too). */}
        {audience === 'STUDENT' ? <AddLinkMaterialDialog kind="ROBOCAMP" onAdd={onLink} /> : null}
      </div>
    </div>
  )
}
