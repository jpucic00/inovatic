import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import { FieldError } from './FieldError'

interface Props {
  register: UseFormRegister<InquiryFormData>
  errors: FieldErrors<InquiryFormData>
}

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

export function InquiryStep2({ register, errors }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Podaci o djetetu</h2>
        <p className="text-gray-500 text-sm">Na temelju dobi preporučit ćemo odgovarajući razred programa.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Ime djeteta <span className="text-red-500">*</span>
        </label>
        <input
          {...register('childName')}
          type="text"
          placeholder="npr. Luka"
          className={inputClass}
        />
        <FieldError message={errors.childName?.message} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Dob djeteta <span className="text-red-500">*</span>
        </label>
        <input
          {...register('childAge')}
          type="number"
          min={5}
          max={16}
          placeholder="npr. 9"
          className={inputClass}
        />
        <FieldError message={errors.childAge?.message} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Škola <span className="text-gray-400 font-normal">(neobavezno)</span>
        </label>
        <input
          {...register('childSchool')}
          type="text"
          placeholder="npr. OŠ Trstenik"
          className={inputClass}
        />
      </div>
    </div>
  )
}
