'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'

export type TagOption = {
  id: string
  name: string
  slug: string
  count: number
}

interface Props {
  availableTags: TagOption[]
  selectedNames: string[]
  onChange: (names: string[]) => void
}

const MAX_VISIBLE = 30

export function TagsCombobox({
  availableTags,
  selectedNames,
  onChange,
}: Readonly<Props>) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const selectedSet = useMemo(
    () => new Set(selectedNames.map((n) => n.toLowerCase())),
    [selectedNames],
  )

  const add = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (selectedSet.has(trimmed.toLowerCase())) {
      setQuery('')
      return
    }
    onChange([...selectedNames, trimmed])
    setQuery('')
  }

  const remove = (name: string) => {
    onChange(selectedNames.filter((n) => n !== name))
  }

  const queryLower = query.trim().toLowerCase()

  // Unselected tags, filtered by query. Already ordered most-used-first by
  // the server.
  const filtered = availableTags.filter(
    (t) =>
      !selectedSet.has(t.name.toLowerCase()) &&
      (queryLower === '' || t.name.toLowerCase().includes(queryLower)),
  )
  const visible = showAll ? filtered : filtered.slice(0, MAX_VISIBLE)
  const hiddenCount = filtered.length - visible.length

  const canCreate =
    queryLower.length > 0 &&
    !selectedSet.has(queryLower) &&
    !availableTags.some((t) => t.name.toLowerCase() === queryLower)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      // Prefer matching an existing tag exactly; otherwise create.
      const exact = availableTags.find(
        (t) => t.name.toLowerCase() === queryLower,
      )
      add(exact?.name ?? query)
    } else if (e.key === 'Backspace' && !query && selectedNames.length > 0) {
      remove(selectedNames[selectedNames.length - 1])
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'

  return (
    <div className="space-y-2">
      {/* Selected pills */}
      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedNames.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 bg-cyan-50 text-cyan-700 border border-cyan-200 text-xs font-medium px-2 py-1 rounded-md"
            >
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                className="hover:text-cyan-900"
                aria-label={`Ukloni ${name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + inline-create input */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Pretraži ili dodaj oznaku..."
        className={inputClass}
      />

      {/* Available tag chips */}
      {visible.length === 0 && !canCreate ? (
        <p className="text-xs text-gray-400 italic">
          {availableTags.length === 0
            ? 'Još nema oznaka. Upiši ime za novu.'
            : 'Nema oznaka koje odgovaraju pretrazi.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => add(tag.name)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-600 hover:border-cyan-400 hover:text-cyan-700"
            >
              <Plus className="w-3 h-3" />
              {tag.name}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={() => add(query)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-cyan-300 text-cyan-700 hover:border-cyan-500 hover:bg-cyan-50"
            >
              <Plus className="w-3 h-3" />
              Kreiraj &quot;{query.trim()}&quot;
            </button>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Prikaži sve ({hiddenCount})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
