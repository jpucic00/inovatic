'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { UseFormRegister, FieldErrors, UseFormSetValue } from 'react-hook-form'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import type { ActiveProgram } from '@/actions/public/programs'
import { FieldError } from './FieldError'

interface Props {
  register: UseFormRegister<InquiryFormData>
  errors: FieldErrors<InquiryFormData>
  setValue: UseFormSetValue<InquiryFormData>
  programs: ActiveProgram[]
  preselectedCourseId?: string
}

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'
const selectClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'
const selectDisabledClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed transition'

const GRADE_OPTIONS = [
  { value: '', label: '– Odaberite razred –' },
  { value: 'predskolci', label: 'Predškolci' },
  { value: '1', label: '1. razred' },
  { value: '2', label: '2. razred' },
  { value: '3', label: '3. razred' },
  { value: '4', label: '4. razred' },
  { value: '5', label: '5. razred' },
  { value: '6', label: '6. razred' },
  { value: '7', label: '7. razred' },
  { value: '8', label: '8. razred' },
]

const GRADE_TO_LEVEL: Record<string, string> = {
  predskolci: 'SLR_1',
  '1': 'SLR_1',
  '2': 'SLR_1',
  '3': 'SLR_2',
  '4': 'SLR_2',
  '5': 'SLR_3',
  '6': 'SLR_3',
  '7': 'SLR_4',
  '8': 'SLR_4',
}

function formatGroupLabel(g: ActiveProgram['groups'][number]): string {
  const parts: string[] = []
  if (g.name) parts.push(g.name)
  if (g.dayOfWeek) parts.push(g.dayOfWeek)
  if (g.startTime) parts.push(g.startTime + (g.endTime ? `–${g.endTime}` : ''))
  if (g.isFull) {
    parts.push('(Popunjeno)')
  } else {
    parts.push(`(${g.availableSpots} ${g.availableSpots === 1 ? 'slobodno mjesto' : 'slobodnih mjesta'})`)
  }
  return parts.join(' · ')
}

export function InquiryStep3({ register, errors, setValue, programs, preselectedCourseId }: Readonly<Props>) {
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [selectedGrade, setSelectedGrade] = useState('')

  const gradeReg = register('grade')
  const gradeSelected = preselectedCourseId || !!selectedGrade

  // Filter programs: workshop page shows only preselected; standard /upisi excludes radionice
  const filteredPrograms = preselectedCourseId
    ? programs
    : programs.filter((p) => {
        if (p.isCustom) return false  // radionice only via their own URL
        if (!selectedGrade) return true
        return p.level === GRADE_TO_LEVEL[selectedGrade]
      })

  const hasAnyGroups = filteredPrograms.some((p) => p.groups.length > 0)

  function handleGradeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedGrade(e.target.value)
    // Reset group selection when grade changes
    setSelectedGroupKey('')
    setValue('scheduledGroupId', undefined)
    setValue('courseId', preselectedCourseId || undefined)
  }

  function handleGroupChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setSelectedGroupKey(val)
    if (val) {
      const [courseId, groupId] = val.split('|')
      setValue('scheduledGroupId', groupId)
      setValue('courseId', courseId)
    } else {
      setValue('scheduledGroupId', undefined)
      setValue('courseId', undefined)
    }
  }

  function renderGroupSelect() {
    if (gradeSelected && hasAnyGroups) {
      return (
        <select
          id="scheduledGroupId"
          value={selectedGroupKey}
          onChange={handleGroupChange}
          className={selectClass}
        >
          <option value="">– Odaberite termin (neobavezno) –</option>
          {filteredPrograms.map((p) => {
            if (p.groups.length === 0) return null
            if (preselectedCourseId) {
              return p.groups.map((g) => (
                <option key={g.id} value={g.isFull ? '' : `${p.id}|${g.id}`} disabled={g.isFull}>
                  {formatGroupLabel(g)}
                </option>
              ))
            }
            return (
              <optgroup key={p.id} label={p.isCustom ? p.title : `${p.title} (${p.ageMin}–${p.ageMax} god.)`}>
                {p.groups.map((g) => (
                  <option key={g.id} value={g.isFull ? '' : `${p.id}|${g.id}`} disabled={g.isFull}>
                    {formatGroupLabel(g)}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
      )
    }
    if (gradeSelected && !hasAnyGroups) {
      return (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-700">
          {preselectedCourseId
            ? 'Nema dostupnih termina za ovu radionicu. Ostavite upit i kontaktirat ćemo vas.'
            : 'Nema otvorenih termina za odabrani razred. Ostavite upit i kontaktirat ćemo vas.'}
        </div>
      )
    }
    return (
      <select disabled className={selectDisabledClass}>
        <option>– Najprije odaberite razred –</option>
      </select>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Dostupni termini</h2>
        <p className="text-gray-500 text-sm">Svi unosi su neobavezni – pomažu nam u dodjeli odgovarajuće grupe.</p>
      </div>

      {!preselectedCourseId && (
        <div>
          <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-1.5">
            Razred djeteta <span className="text-red-500">*</span>
          </label>
          <select
            id="grade"
            {...gradeReg}
            onChange={(e) => {
              gradeReg.onChange(e)
              handleGradeChange(e)
            }}
            className={selectClass}
          >
            {GRADE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <FieldError message={errors.grade?.message} />
        </div>
      )}

      <div>
        <label htmlFor="scheduledGroupId" className="block text-sm font-medium text-gray-700 mb-1.5">
          Željeni termin <span className="text-gray-400 font-normal">(neobavezno)</span>
        </label>
        {renderGroupSelect()}
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1.5">Poruka</label>
        <textarea
          id="message"
          {...register('message')}
          rows={4}
          placeholder="Imate li pitanja ili posebnih napomena?"
          className={`${inputClass} resize-none`}
        />
        <FieldError message={errors.message?.message} />
      </div>

      <div>
        <label htmlFor="referralSource" className="block text-sm font-medium text-gray-700 mb-1.5">
          Kako ste čuli za nas? <span className="text-gray-400 font-normal">(neobavezno)</span>
        </label>
        <select
          id="referralSource"
          {...register('referralSource')}
          className={selectClass}
        >
          <option value="">– Odaberite –</option>
          <option value="Preporuka prijatelja ili obitelji">Preporuka prijatelja ili obitelji</option>
          <option value="Instagram">Instagram</option>
          <option value="Facebook">Facebook</option>
          <option value="Google pretraživanje">Google pretraživanje</option>
          <option value="Škola ili učitelj">Škola ili učitelj</option>
          <option value="Letak ili plakat">Letak ili plakat</option>
          <option value="Ostalo">Ostalo</option>
        </select>
      </div>
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register('consent')}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
          />
          <span className="text-sm text-gray-600">
            Suglasan/na sam s{' '}
            <Link href="/politika-privatnosti" target="_blank" className="text-cyan-600 hover:underline">
              politikom privatnosti
            </Link>{' '}
            i obradom osobnih podataka u svrhu obrade upita.
          </span>
        </label>
        <FieldError message={errors.consent?.message} />
      </div>
    </div>
  )
}
