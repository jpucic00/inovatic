'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type {
  UseFormRegister,
  FieldErrors,
  UseFormSetValue,
  UseFormGetValues,
  UseFormClearErrors,
} from 'react-hook-form'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import type { ActiveProgram } from '@/actions/public/programs'
import {
  ELEMENTARY_GRADE_VALUES,
  GRADE_LABELS,
  NO_SUITABLE_TERMIN_LABEL,
  type Grade,
} from '@/lib/inquiry-status'
import { programsForSelection } from '@/lib/inquiry-availability'
import { formatGroupSchedule } from '@/lib/format'
import { FieldError } from './FieldError'
import { hasModules, isCompetition, isRadionica } from '@/lib/program-kind'
import type { ProgramKind } from '@prisma/client'

interface Props {
  register: UseFormRegister<InquiryFormData>
  errors: FieldErrors<InquiryFormData>
  setValue: UseFormSetValue<InquiryFormData>
  getValues: UseFormGetValues<InquiryFormData>
  clearErrors: UseFormClearErrors<InquiryFormData>
  programs: ActiveProgram[]
  preselectedCourseId?: string
  /**
   * Which razred options to offer. Defaults to osnovna škola — the competition
   * signup link passes the full set so srednjoškolci can apply there and only
   * there.
   */
  gradeOptions?: readonly Grade[]
  /** Whether the current grade/course selection forces a termin choice. */
  terminRequired: boolean
}

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'
const selectClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'
const selectDisabledClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed transition'

// Sentinel <option> value for the "no proposed termin suits me" answer. Free of
// '|' so it can never collide with a real `${courseId}|${groupId}` key.
const NO_SUITABLE_TERMIN_VALUE = 'no-suitable-termin'

function formatGroupLabel(g: ActiveProgram['groups'][number], kind: ProgramKind): string {
  const parts: string[] = []
  if (g.name) parts.push(g.name)
  const schedule = formatGroupSchedule({
    dateRange: isRadionica(kind),
    dayOfWeek: g.dayOfWeek,
    dateStart: g.dateStart,
    dateEnd: g.dateEnd,
    startTime: g.startTime,
    endTime: g.endTime,
  })
  if (schedule) parts.push(schedule)
  if (g.isFull) {
    parts.push('(Popunjeno)')
  } else {
    parts.push(`(${g.availableSpots} ${g.availableSpots === 1 ? 'slobodno mjesto' : 'slobodnih mjesta'})`)
  }
  return parts.join(' · ')
}

export function InquiryStep3({
  register,
  errors,
  setValue,
  getValues,
  clearErrors,
  programs,
  preselectedCourseId,
  gradeOptions = ELEMENTARY_GRADE_VALUES,
  terminRequired,
}: Readonly<Props>) {
  const [selectedGroupKey, setSelectedGroupKey] = useState(() => {
    // Step 3 unmounts when the parent steps back, so restore whichever of the
    // two answers the dropdown produces.
    if (getValues('noSuitableTermin')) return NO_SUITABLE_TERMIN_VALUE
    const courseId = getValues('courseId')
    const groupId = getValues('scheduledGroupId')
    return courseId && groupId ? `${courseId}|${groupId}` : ''
  })
  const [selectedGrade, setSelectedGrade] = useState<Grade | ''>(() => getValues('grade') ?? '')

  const gradeReg = register('grade')
  const gradeSelected = preselectedCourseId || !!selectedGrade

  // The open programs whose groups render in the dropdown — radionica page shows
  // only its own course; standard /prijava excludes radionice and narrows to the
  // selected grade's level (shared with the parent's terminRequired check).
  const filteredPrograms = programsForSelection(programs, selectedGrade, preselectedCourseId)

  const hasAnyGroups = filteredPrograms.some((p) => p.groups.length > 0)

  // "Ne odgovara mi predloženi termin" is offered on the competitive program
  // only: its termini are few, sent by invitation and negotiable, so a parent
  // who can make none of them must still be able to answer. The SLR ladder and
  // the radionice keep the termin a hard choice — there the parent either takes
  // an offered slot or sends a general, termin-less inquiry.
  // Tied to `hasAnyGroups`, not merely to the program: the refusal only means
  // something while the dropdown is actually offering termini.
  const offersNoSuitableTermin =
    hasAnyGroups && filteredPrograms.every((p) => isCompetition(p.kind))

  useEffect(() => {
    // The escape hatch went away with the program that offered it (a city
    // switch, or a poll that closed the last termin) — drop the answer too, so
    // the inquiry cannot claim a termin was refused where none was proposed.
    if (!offersNoSuitableTermin && getValues('noSuitableTermin')) {
      setValue('noSuitableTermin', false)
      setSelectedGroupKey('')
      return
    }
    if (!selectedGroupKey || selectedGroupKey === NO_SUITABLE_TERMIN_VALUE) return
    const [courseId, groupId] = selectedGroupKey.split('|')
    const program = programs.find((p) => p.id === courseId)
    const group = program?.groups.find((g) => g.id === groupId)
    if (!group || group.isFull) {
      setSelectedGroupKey('')
      setValue('scheduledGroupId', undefined)
      setValue('courseId', preselectedCourseId || undefined)
    }
  }, [programs]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleGradeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedGrade(e.target.value as Grade | '')
    // Reset group selection when grade changes
    setSelectedGroupKey('')
    setValue('scheduledGroupId', undefined)
    setValue('noSuitableTermin', false)
    setValue('courseId', preselectedCourseId || undefined)
    // A stale "pick a termin" error from a prior grade no longer applies.
    clearErrors('scheduledGroupId')
  }

  function handleGroupChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setSelectedGroupKey(val)
    clearErrors('scheduledGroupId')
    // The refusal is an answer, not a group: it satisfies the termin
    // requirement while leaving the inquiry group-less for the admin to follow
    // up on. Selecting a real termin (or clearing) always takes it back off.
    setValue('noSuitableTermin', val === NO_SUITABLE_TERMIN_VALUE)
    if (val && val !== NO_SUITABLE_TERMIN_VALUE) {
      const [courseId, groupId] = val.split('|')
      setValue('scheduledGroupId', groupId)
      setValue('courseId', courseId)
    } else {
      setValue('scheduledGroupId', undefined)
      // Clearing the termin must not drop the workshop association in the
      // radionica flow — mirror handleGradeChange and restore the preselection.
      setValue('courseId', preselectedCourseId || undefined)
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
          <option value="">
            {'– Odaberite termin –'}
          </option>
          {filteredPrograms.map((p) => {
            if (p.groups.length === 0) return null
            if (preselectedCourseId) {
              return p.groups.map((g) => (
                <option key={g.id} value={g.isFull ? '' : `${p.id}|${g.id}`} disabled={g.isFull}>
                  {formatGroupLabel(g, p.kind)}
                </option>
              ))
            }
            return (
              <optgroup key={p.id} label={hasModules(p.kind) ? `${p.title} (${p.ageMin}–${p.ageMax} god.)` : p.title}>
                {p.groups.map((g) => (
                  <option key={g.id} value={g.isFull ? '' : `${p.id}|${g.id}`} disabled={g.isFull}>
                    {formatGroupLabel(g, p.kind)}
                  </option>
                ))}
              </optgroup>
            )
          })}
          {offersNoSuitableTermin && (
            <option value={NO_SUITABLE_TERMIN_VALUE}>{NO_SUITABLE_TERMIN_LABEL}</option>
          )}
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
        <p className="text-gray-500 text-sm">
          {terminRequired
            ? 'Za odabrani razred trenutačno su dostupni termini – odaberite željeni termin.'
            : 'Svi unosi su neobavezni – pomažu nam u dodjeli odgovarajuće grupe.'}
        </p>
      </div>

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
          <option value="">– Odaberite razred –</option>
          {gradeOptions.map((v) => (
            <option key={v} value={v}>{GRADE_LABELS[v]}</option>
          ))}
        </select>
        <FieldError message={errors.grade?.message} />
      </div>

      <div>
        <label htmlFor="scheduledGroupId" className="block text-sm font-medium text-gray-700 mb-1.5">
          Željeni termin{terminRequired && <>{' '}<span className="text-red-500">*</span></>}
        </label>
        {renderGroupSelect()}
        <FieldError message={errors.scheduledGroupId?.message} />
        {selectedGroupKey === NO_SUITABLE_TERMIN_VALUE && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Javit ćemo vam se i pokušati dogovoriti termin koji vam odgovara. Ako imate željeni dan
            ili sat, upišite ga u poruku.
          </p>
        )}
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
