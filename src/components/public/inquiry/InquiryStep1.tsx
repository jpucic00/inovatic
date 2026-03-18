import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { InquiryFormData } from '@/lib/validators/inquiry'
import { FieldError } from './FieldError'

interface Props {
  register: UseFormRegister<InquiryFormData>
  errors: FieldErrors<InquiryFormData>
}

const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'

export function InquiryStep1({ register, errors }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Podaci o roditelju / skrbniku</h2>
        <p className="text-gray-500 text-sm">Na ovu adresu ćemo vam poslati dostupne termine.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Ime i prezime <span className="text-red-500">*</span>
        </label>
        <input
          {...register('parentName')}
          type="text"
          placeholder="npr. Ana Horvat"
          className={inputClass}
        />
        <FieldError message={errors.parentName?.message} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Email adresa <span className="text-red-500">*</span>
        </label>
        <input
          {...register('parentEmail')}
          type="email"
          placeholder="npr. ana.horvat@gmail.com"
          className={inputClass}
        />
        <FieldError message={errors.parentEmail?.message} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Broj telefona <span className="text-red-500">*</span>
        </label>
        <input
          {...register('parentPhone')}
          type="tel"
          placeholder="npr. 091 234 5678"
          className={inputClass}
        />
        <FieldError message={errors.parentPhone?.message} />
      </div>
    </div>
  )
}
