import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import { FieldError } from './FieldError'

interface Props {
  register: UseFormRegister<InquiryFormData>
  errors: FieldErrors<InquiryFormData>
}

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'
const selectClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

export function InquiryStep3({ register, errors }: Readonly<Props>) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Preferencije</h2>
        <p className="text-gray-500 text-sm">Svi unosi su neobavezni – pomažu nam u dodjeli odgovarajuće grupe.</p>
      </div>
      <div>
        <label htmlFor="courseLevelPref" className="block text-sm font-medium text-gray-700 mb-1.5">Program</label>
        <select id="courseLevelPref" {...register('courseLevelPref')} className={selectClass}>
          <option value="">– Odaberite program (neobavezno) –</option>
          <option value="SLR_1">SLR 1 – Uvod u robotiku (6–8 god.)</option>
          <option value="SLR_2">SLR 2 – Napredna mehanika (9–10 god.)</option>
          <option value="SLR_3">SLR 3 – Spike Prime (11–12 god.)</option>
          <option value="SLR_4">SLR 4 – Industrijski sustavi (13–14 god.)</option>
        </select>
      </div>
      <div>
        <label htmlFor="locationPref" className="block text-sm font-medium text-gray-700 mb-1.5">Preferencija lokacije</label>
        <select id="locationPref" {...register('locationPref')} className={selectClass}>
          <option value="">– Odaberite lokaciju (neobavezno) –</option>
          <option value="Velebitska 32">Velebitska 32, Split</option>
          <option value="Ruđera Boškovića 33">Ruđera Boškovića 33, Split</option>
        </select>
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
    </div>
  )
}
