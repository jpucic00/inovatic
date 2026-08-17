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

// grade is required for every inquiry — both the /prijava flow and the
// /radionice/{slug} preselect flow. On radionica forms it is captured
// for admin reference only and does not gate group selection.
const step3Schema = z.object({
  grade: z.enum(GRADE_VALUES, {
    errorMap: () => ({ message: 'Odaberite razred djeteta' }),
  }),
  courseId: z.string().optional(),
  scheduledGroupId: z.string().optional(),
  // "Ne odgovara mi predloženi termin" — the other half of the same dropdown, so
  // it is an answer to the termin question rather than a missing answer. Offered
  // on the competitive program's signup link only; `submitInquiry` is what
  // enforces that, since a payload can claim it anywhere.
  noSuitableTermin: z.boolean().optional(),
  // "Želim doći na besplatni probni sat." Offered only to first-timers on a
  // standard program, but like every other client-supplied answer it is
  // re-decided server-side: `submitInquiry` drops it for a child the two-tier
  // identity match already knows, so ticking it in a crafted payload buys
  // nothing.
  wantsTrial: z.boolean().optional(),
  message: z.string().max(1000, 'Poruka može imati najviše 1000 znakova').optional(),
  referralSource: z.string().max(200).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Morate pristati na obradu osobnih podataka.' }),
  }),
})

export const inquirySchema = step1Schema
  .merge(step2Schema)
  .merge(step3Schema)
  // One dropdown produces both termin fields, so a chosen group and "nijedan
  // termin mi ne odgovara" are mutually exclusive by construction — a payload
  // carrying both is tampered, and rejecting it keeps the stored inquiry from
  // ever contradicting itself.
  .superRefine((data, ctx) => {
    if (data.noSuitableTermin && data.scheduledGroupId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledGroupId'],
        message: 'Odaberite termin ili označite da vam predloženi termin ne odgovara.',
      })
    }
  })

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
