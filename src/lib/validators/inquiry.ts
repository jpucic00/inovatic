import { z } from 'zod'
import { GRADE_VALUES } from '@/lib/inquiry-status'

const step1Schema = z.object({
  parentName: z.string().min(2, 'Unesite ime i prezime (najmanje 2 znaka)'),
  parentEmail: z.string().email('Unesite valjanu email adresu'),
  parentPhone: z.string().min(9, 'Unesite valjani broj telefona'),
})

const step2Schema = z.object({
  childFirstName: z.string().min(2, 'Unesite ime djeteta (najmanje 2 znaka)'),
  childLastName: z.string().min(2, 'Unesite prezime djeteta (najmanje 2 znaka)'),
  childDateOfBirth: z.string().min(1, 'Unesite datum rođenja'),
  childSchool: z.string().optional(),
})

// Includes the 'workshop' sentinel used by the radionica preselection flow,
// where the visible grade dropdown is hidden and the value is set in form
// defaults. Persisted as-is on childGrade; admin views fall back to the raw
// string in the (rare) absence of a label.
const step3Schema = z.object({
  grade: z.enum([...GRADE_VALUES, 'workshop'] as const, {
    errorMap: () => ({ message: 'Odaberite razred djeteta' }),
  }),
  courseId: z.string().optional(),
  scheduledGroupId: z.string().optional(),
  message: z.string().max(1000, 'Poruka može imati najviše 1000 znakova').optional(),
  referralSource: z.string().max(200).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Morate pristati na obradu osobnih podataka.' }),
  }),
})

export const inquirySchema = step1Schema.merge(step2Schema).merge(step3Schema)

export type InquiryFormData = z.infer<typeof inquirySchema>
