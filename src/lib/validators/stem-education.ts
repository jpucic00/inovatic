import { z } from 'zod'

/**
 * B2B inquiry for the "STEM edukacija za učitelje, nastavnike i mentore"
 * service (/stem-edukacija). Unlike the course and party forms this one is
 * NOT persisted — the submission exists only as the notification email sent
 * to the association, so the labels below are the single source of truth for
 * both the form UI and the email body.
 */

export const INSTITUTION_TYPE_LABELS = {
  OSNOVNA_SKOLA: 'Osnovna škola',
  SREDNJA_SKOLA: 'Srednja škola',
  UDRUGA: 'Udruga',
  KNJIZNICA: 'Knjižnica',
  CENTAR_TEHNICKE_KULTURE: 'Centar tehničke kulture',
  OBRAZOVNA_USTANOVA: 'Obrazovna ustanova',
  JAVNA_INSTITUCIJA: 'Javna institucija',
  TVRTKA: 'Tvrtka ili druga pravna osoba',
  DRUGO: 'Druga ustanova ili organizacija',
} as const

export const SERVICE_LABELS = {
  OSNOVNA_EDUKACIJA: 'Osnovna edukacija mentora',
  NAPREDNA_EDUKACIJA: 'Napredna edukacija mentora',
  POSTOJECA_OPREMA: 'Edukacija za korištenje postojeće opreme',
  ODABIR_OPREME: 'Pomoć pri odabiru STEM opreme',
  RADIONICE_KURIKULUM: 'Izrada radionica ili kurikuluma',
  PROJEKT_NATJECAJ: 'Edukacija u sklopu projekta ili natječaja',
  SAVJETOVANJE: 'Savjetovanje',
} as const

export const TRAINING_PLACE_LABELS = {
  USTANOVA_NARUCITELJA: 'U našoj školi ili ustanovi',
  PROSTORI_INOVATIC: 'U prostorima Inovatica',
  NEODLUCENO: 'Još nismo odlučili',
} as const

export const INSTITUTION_TYPE_VALUES = Object.keys(
  INSTITUTION_TYPE_LABELS,
) as [keyof typeof INSTITUTION_TYPE_LABELS, ...(keyof typeof INSTITUTION_TYPE_LABELS)[]]

export const SERVICE_VALUES = Object.keys(SERVICE_LABELS) as [
  keyof typeof SERVICE_LABELS,
  ...(keyof typeof SERVICE_LABELS)[],
]

export const TRAINING_PLACE_VALUES = Object.keys(TRAINING_PLACE_LABELS) as [
  keyof typeof TRAINING_PLACE_LABELS,
  ...(keyof typeof TRAINING_PLACE_LABELS)[],
]

export const stemEducationInquirySchema = z.object({
  contactName: z
    .string()
    .trim()
    .min(2, 'Unesite ime i prezime (najmanje 2 znaka)')
    .max(120, 'Ime i prezime može imati najviše 120 znakova'),
  institutionName: z
    .string()
    .trim()
    .min(2, 'Unesite naziv ustanove (najmanje 2 znaka)')
    .max(200, 'Naziv ustanove može imati najviše 200 znakova')
    // This is the one place raw visitor text reaches a mail header
    // (`Upit za STEM edukaciju – ${institutionName}`). `.trim()` strips only the
    // ends, so interior CR/LF survives — verified: the schema accepted
    // 'OS Meje\r\nBcc: x@y.com'. Resend's JSON API almost certainly encodes it,
    // so this is defence in depth rather than a live exploit.
    // eslint-disable-next-line no-control-regex
    .transform((s) => s.replace(/[\u0000-\u001f]+/g, ' ').trim()),
  email: z
    .string()
    .trim()
    .email('Unesite valjanu email adresu')
    .max(254, 'E-mail adresa može imati najviše 254 znaka'),
  // Optional — the WP form does not require a phone number either.
  phone: z
    .union([z.string().trim().min(9, 'Unesite valjani broj telefona'), z.literal('')])
    .optional(),
  institutionType: z.enum(INSTITUTION_TYPE_VALUES, {
    errorMap: () => ({ message: 'Odaberite vrstu ustanove' }),
  }),
  // Only 7 values exist, so anything longer is a crafted payload rather than a
  // form submission. Unbounded, it reached the email body as a multi-megabyte
  // join and gave the confirmation template duplicate React keys.
  services: z
    .array(z.enum(SERVICE_VALUES))
    .min(1, 'Odaberite barem jednu uslugu')
    .max(SERVICE_VALUES.length, 'Neispravan odabir usluga.')
    .transform((s) => [...new Set(s)]),
  // Optional select — the placeholder option submits '' rather than nothing.
  trainingPlace: z.union([z.enum(TRAINING_PLACE_VALUES), z.literal('')]).optional(),
  message: z
    .string()
    .trim()
    .min(10, 'Opišite svoje potrebe (najmanje 10 znakova)')
    .max(2000, 'Poruka može imati najviše 2000 znakova'),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Morate pristati na obradu osobnih podataka.' }),
  }),
  // Honeypot: hidden in the form, so a human never fills it. Bots that submit
  // every field give themselves away. Accepted by the schema and handled in the
  // action, which reports success without sending anything.
  website: z.string().optional(),
})

export type StemEducationInquiryFormData = z.infer<typeof stemEducationInquirySchema>
