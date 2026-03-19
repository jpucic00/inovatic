import { z } from 'zod'

export const step1Schema = z.object({
  parentName: z.string().min(2, 'Unesite ime i prezime (najmanje 2 znaka)'),
  parentEmail: z.string().email('Unesite valjanu email adresu'),
  parentPhone: z.string().min(9, 'Unesite valjani broj telefona'),
})

export const step2Schema = z.object({
  childName: z.string().min(2, 'Unesite ime djeteta (najmanje 2 znaka)'),
  childAge: z.coerce
    .number({ invalid_type_error: 'Unesite dob' })
    .int()
    .min(5, 'Dob mora biti najmanje 5 godina')
    .max(16, 'Dob mora biti najviše 16 godina'),
  childSchool: z.string().optional(),
})

export const step3Schema = z.object({
  courseLevelPref: z.enum(['SLR_1', 'SLR_2', 'SLR_3', 'SLR_4']).optional(),
  locationPref: z.string().optional(),
  message: z.string().max(1000, 'Poruka može imati najviše 1000 znakova').optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Morate pristati na obradu osobnih podataka.' }),
  }),
})

export const inquirySchema = step1Schema.merge(step2Schema).merge(step3Schema)

export type InquiryFormData = z.infer<typeof inquirySchema>
