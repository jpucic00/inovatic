import { z } from 'zod'
import { GRADE_VALUES } from '@/lib/inquiry-status'
import { CITY_VALUES } from '@/lib/city'

const step1Schema = z.object({
  // Mandatory tenant choice — first field of the public form, no default.
  city: z.enum(CITY_VALUES, {
    errorMap: () => ({ message: 'Odaberite grad' }),
  }),
  parentName: z.string().min(2, 'Unesite ime i prezime (najmanje 2 znaka)'),
  parentEmail: z.string().email('Unesite valjanu email adresu'),
  parentPhone: z.string().min(9, 'Unesite valjani broj telefona'),
})

const step2Schema = z.object({
  childFirstName: z.string().min(2, 'Unesite ime djeteta (najmanje 2 znaka)'),
  childLastName: z.string().min(2, 'Unesite prezime djeteta (najmanje 2 znaka)'),
  childDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Unesite datum rođenja (GGGG-MM-DD)'),
  childSchool: z.string().optional(),
})

// grade is required for every inquiry — both the /upisi flow and the
// /radionice/{slug} preselect flow. On radionica forms it is captured
// for admin reference only and does not gate group selection.
const step3Schema = z.object({
  grade: z.enum(GRADE_VALUES, {
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

// ── Party (proslava) sign-up ────────────────────────────────────────────────
// Standalone schema for the /proslave booking form. It has no child/course and
// captures the parent's first/last name separately (combined into
// Inquiry.parentName on submit) plus an optional preferred date. `message` is
// the parent's inquiry text and is required here (unlike the course flow, it is
// the primary content of a party booking).
export const partyInquirySchema = z.object({
  parentFirstName: z.string().trim().min(2, 'Unesite ime (najmanje 2 znaka)'),
  parentLastName: z.string().trim().min(2, 'Unesite prezime (najmanje 2 znaka)'),
  parentPhone: z.string().trim().min(9, 'Unesite valjani broj telefona'),
  parentEmail: z.string().trim().email('Unesite valjanu email adresu'),
  message: z
    .string()
    .trim()
    .min(5, 'Unesite poruku (najmanje 5 znakova)')
    .max(1000, 'Poruka može imati najviše 1000 znakova'),
  // Optional preferred date. DateInput emits 'YYYY-MM-DD' or '' when cleared.
  partyProposedDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Neispravan datum'), z.literal('')])
    .optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Morate pristati na obradu osobnih podataka.' }),
  }),
})

export type PartyInquiryFormData = z.infer<typeof partyInquirySchema>
