'use client'

import { Users } from 'lucide-react'

export type TeacherOption = {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface Props {
  teachers: TeacherOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  label?: string
  hint?: string
  idPrefix?: string
}

export function TeacherMultiSelect({
  teachers,
  selectedIds,
  onChange,
  label = 'Nastavnici',
  hint = 'Neobavezno. Možete dodijeliti više nastavnika.',
  idPrefix = 'teacher-select',
}: Readonly<Props>) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  if (teachers.length === 0) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <p className="text-xs text-gray-400 italic py-2">
          Nema kreiranih nastavnika. Dodajte nastavnike na stranici{' '}
          <span className="font-medium">Nastavnici</span>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-gray-500" />
        {label}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
        {teachers.map((t) => (
          <label
            key={t.id}
            htmlFor={`${idPrefix}-${t.id}`}
            className="flex items-center gap-2 p-2.5 hover:bg-gray-50 cursor-pointer"
          >
            <input
              id={`${idPrefix}-${t.id}`}
              type="checkbox"
              checked={selectedIds.includes(t.id)}
              onChange={() => toggle(t.id)}
              className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span className="flex-1 text-sm text-gray-800">
              {t.firstName} {t.lastName}
            </span>
            <span className="text-xs text-gray-400">{t.email}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
