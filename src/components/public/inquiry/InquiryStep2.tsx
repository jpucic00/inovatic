'use client'

import { useState } from 'react'
import type { UseFormRegister, FieldErrors, UseFormSetValue } from 'react-hook-form'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import { FieldError } from './FieldError'

interface Props {
  register: UseFormRegister<InquiryFormData>
  errors: FieldErrors<InquiryFormData>
  setValue: UseFormSetValue<InquiryFormData>
}

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'
const selectClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

const MONTHS_HR = [
  { value: '01', label: 'Siječanj' },
  { value: '02', label: 'Veljača' },
  { value: '03', label: 'Ožujak' },
  { value: '04', label: 'Travanj' },
  { value: '05', label: 'Svibanj' },
  { value: '06', label: 'Lipanj' },
  { value: '07', label: 'Srpanj' },
  { value: '08', label: 'Kolovoz' },
  { value: '09', label: 'Rujan' },
  { value: '10', label: 'Listopad' },
  { value: '11', label: 'Studeni' },
  { value: '12', label: 'Prosinac' },
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 17 }, (_, i) => CURRENT_YEAR - 4 - i)

export function InquiryStep2({ register, errors, setValue }: Readonly<Props>) {
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')

  function updateDOB(d: string, m: string, y: string) {
    if (d && m && y) {
      setValue('childDateOfBirth', `${y}-${m}-${d.padStart(2, '0')}`, {
        shouldValidate: true,
        shouldTouch: true,
      })
    } else {
      setValue('childDateOfBirth', '', { shouldTouch: !!d || !!m || !!y })
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Podaci o djetetu</h2>
        <p className="text-gray-500 text-sm">Na temelju datuma rođenja preporučit ćemo odgovarajući razred programa.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="childFirstName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Ime <span className="text-red-500">*</span>
          </label>
          <input
            id="childFirstName"
            {...register('childFirstName')}
            type="text"
            placeholder="npr. Luka"
            className={inputClass}
          />
          <FieldError message={errors.childFirstName?.message} />
        </div>
        <div>
          <label htmlFor="childLastName" className="block text-sm font-medium text-gray-700 mb-1.5">
            Prezime <span className="text-red-500">*</span>
          </label>
          <input
            id="childLastName"
            {...register('childLastName')}
            type="text"
            placeholder="npr. Horvat"
            className={inputClass}
          />
          <FieldError message={errors.childLastName?.message} />
        </div>
      </div>

      <div>
        <label htmlFor="dob-day" className="block text-sm font-medium text-gray-700 mb-1.5">
          Datum rođenja <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <select
            id="dob-day"
            value={day}
            onChange={(e) => { setDay(e.target.value); updateDOB(e.target.value, month, year) }}
            className={`${selectClass} ${day ? 'text-gray-900' : 'text-gray-400'}`}
          >
            <option value="">Dan</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)} className="text-gray-900">{d}</option>
            ))}
          </select>
          <select
            id="dob-month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); updateDOB(day, e.target.value, year) }}
            className={`${selectClass} ${month ? 'text-gray-900' : 'text-gray-400'}`}
          >
            <option value="">Mjesec</option>
            {MONTHS_HR.map((m) => (
              <option key={m.value} value={m.value} className="text-gray-900">{m.label}</option>
            ))}
          </select>
          <select
            id="dob-year"
            value={year}
            onChange={(e) => { setYear(e.target.value); updateDOB(day, month, e.target.value) }}
            className={`${selectClass} ${year ? 'text-gray-900' : 'text-gray-400'}`}
          >
            <option value="">Godina</option>
            {YEARS.map((y) => (
              <option key={y} value={String(y)} className="text-gray-900">{y}</option>
            ))}
          </select>
        </div>
        <FieldError message={errors.childDateOfBirth?.message} />
      </div>

      <div>
        <label htmlFor="childSchool" className="block text-sm font-medium text-gray-700 mb-1.5">
          Škola <span className="text-gray-400 font-normal">(neobavezno)</span>
        </label>
        <input
          id="childSchool"
          {...register('childSchool')}
          type="text"
          placeholder="npr. OŠ Trstenik"
          className={inputClass}
        />
      </div>
    </div>
  )
}
