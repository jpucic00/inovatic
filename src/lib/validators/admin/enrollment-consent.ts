import { z } from 'zod'

// Each consent is three-state, so `null` ("nije uneseno") is a real value the
// admin can set — clearing a mistyped answer must not be impossible.
const consentValue = z.boolean({ invalid_type_error: 'Nevaljani podaci.' }).nullable()

export const setEnrollmentConsentsSchema = z.object({
  enrollmentId: z.string().min(1, 'Nevaljani podaci.'),
  consentGallery: consentValue,
  consentWebsite: consentValue,
  consentSocial: consentValue,
  consentEmail: consentValue,
})

export type SetEnrollmentConsentsInput = z.infer<typeof setEnrollmentConsentsSchema>
