import Link from 'next/link'
import type { MaterialType, MaterialScope } from '@prisma/client'
import { displayKindOf, formatBytes, resolveHref } from '@/lib/material-display'
import {
  MATERIAL_KIND_LABEL,
  MATERIAL_KIND_LABEL_CLASS,
  MaterialKindTile,
} from './material-kind'
import { EditMaterialDialog } from './edit-material-dialog'
import { DeleteMaterialButton } from './delete-material-button'
import { HideInGroupToggle } from './hide-in-group-toggle'

export type StaffMaterialRow = {
  id: string
  title: string
  description: string | null
  type: MaterialType
  scope: MaterialScope
  fileUrl: string | null
  externalUrl: string | null
  fileSize: number | null
  mimeType: string | null
  sortOrder: number
  moduleId?: string | null
  moduleTitle?: string | null
  courseTitle?: string | null
  groupName?: string | null
  hiddenInThisGroup?: boolean
  uploadedBy?: string | null
  uploadedByDeleted?: boolean
  /** Id of the user who uploaded this material. */
  uploadedById?: string | null
  /**
   * Whether the current viewer may edit/delete this row. When `false`, only a
   * hide toggle (for inherited MODULE/COURSE rows) is shown. Defaults to `true`
   * when omitted (e.g. the admin program page, where admin owns everything).
   */
  canEdit?: boolean
}

interface Props {
  rows: StaffMaterialRow[]
  /** When set, rows will show a hide-in-group toggle for MODULE/COURSE items. */
  inGroupId?: string | null
  emptyLabel?: string
}

const SCOPE_LABEL: Record<MaterialScope, string> = {
  MODULE: 'Modul',
  COURSE: 'Cijeli program',
  GROUP: 'Grupa',
}

export function StaffMaterialList({ rows, inGroupId, emptyLabel }: Readonly<Props>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-500">{emptyLabel ?? 'Još nema materijala.'}</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {rows.map((row) => {
        const href = resolveHref(row)
        const size = formatBytes(row.fileSize)
        let scopeDetail: string | null | undefined
        if (row.scope === 'MODULE') scopeDetail = row.moduleTitle
        else if (row.scope === 'COURSE') scopeDetail = row.courseTitle
        else scopeDetail = row.groupName

        const isDimmed = row.hiddenInThisGroup === true
        const kind = displayKindOf(row)

        return (
          <li
            key={row.id}
            className={[
              'flex items-start gap-3.5 px-4 py-3.5 transition-colors',
              isDimmed ? 'opacity-60' : '',
            ].join(' ')}
          >
            {/* Same tile the kids' list uses, so both sides read one vocabulary.
                The scope beside it does NOT cross over: to a teacher it decides
                whether this row can be edited, only hidden, or neither. */}
            <MaterialKindTile kind={kind} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {href ? (
                  <Link
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-gray-900 hover:text-cyan-700 hover:underline truncate"
                  >
                    {row.title}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-gray-900 truncate">{row.title}</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide ${MATERIAL_KIND_LABEL_CLASS[kind]}`}
                >
                  {MATERIAL_KIND_LABEL[kind]}
                </span>
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide rounded bg-gray-100 px-1.5 py-0.5">
                  {SCOPE_LABEL[row.scope]}
                  {scopeDetail ? ` · ${scopeDetail}` : ''}
                </span>
                {row.hiddenInThisGroup ? (
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                    Sakriveno u grupi
                  </span>
                ) : null}
                {size ? <span className="text-xs text-gray-500">{size}</span> : null}
              </div>
              {row.description ? (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{row.description}</p>
              ) : null}
              {row.uploadedBy ? (
                <p className="text-[11px] text-gray-400 mt-1">
                  Dodao: {row.uploadedBy}
                  {row.uploadedByDeleted ? (
                    <span className="ml-1.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      Bivši nastavnik
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {inGroupId && (row.scope === 'MODULE' || row.scope === 'COURSE') ? (
                <HideInGroupToggle
                  materialId={row.id}
                  scheduledGroupId={inGroupId}
                  hidden={row.hiddenInThisGroup === true}
                />
              ) : null}
              {row.canEdit !== false ? (
                <>
                  <EditMaterialDialog
                    id={row.id}
                    title={row.title}
                    description={row.description}
                    sortOrder={row.sortOrder}
                    type={row.type}
                    fileUrl={row.fileUrl}
                    fileSize={row.fileSize}
                  />
                  <DeleteMaterialButton id={row.id} title={row.title} />
                </>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
