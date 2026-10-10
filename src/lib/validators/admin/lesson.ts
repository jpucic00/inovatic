import { z } from 'zod'
import {
  validateRobocampAudience,
  validateTypeUrlPairing,
} from '@/lib/validators/material'

const audience = z.enum(['STUDENT', 'TEACHER'])

const lessonFields = {
  title: z.string().trim().min(2, 'Naziv lekcije mora imati barem 2 znaka.').max(200),
  description: z
    .union([z.literal(''), z.string().trim().max(2000)])
    .optional()
    .nullable()
    .transform((v) => v || null),
  /** 0 = probni sat, 1–7 = the module's sats. Empty = undated. */
  sessionNumbers: z
    .array(z.number().int().min(0).max(7))
    .max(8)
    .refine((list) => new Set(list).size === list.length, 'Isti sat je odabran dvaput.'),
}

/**
 * A material attached while a lesson is being created — the file is already on
 * Cloudinary (the upload route ran when it was dropped); it only becomes a row
 * together with the lesson.
 */
const stagedMaterial = z
  .object({
    audience,
    title: z.string().trim().min(2).max(200),
    description: z.union([z.literal(''), z.string().max(2000)]).optional().nullable(),
    type: z.enum(['DOCUMENT', 'PRESENTATION', 'VIDEO', 'LINK', 'ROBOCAMP']),
    fileUrl: z.union([z.literal(''), z.string().url()]).optional().nullable(),
    externalUrl: z.union([z.literal(''), z.string().url()]).optional().nullable(),
    fileSize: z.number().int().nonnegative().optional().nullable(),
    mimeType: z.string().max(200).optional().nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    validateTypeUrlPairing(val, ctx)
    validateRobocampAudience(val, ctx)
  })

export const createLessonSchema = z
  .object({
    courseId: z.string().min(1),
    /** null only for a radionica (no modules). */
    moduleId: z.string().min(1).nullable(),
    ...lessonFields,
    materials: z.array(stagedMaterial).max(40).default([]),
  })
  .strict()

export type CreateLessonInput = z.input<typeof createLessonSchema>

export const updateLessonSchema = z
  .object({
    id: z.string().min(1),
    ...lessonFields,
  })
  .strict()

export type UpdateLessonInput = z.input<typeof updateLessonSchema>

export const setMaterialsAudienceSchema = z
  .object({
    materialIds: z.array(z.string().min(1)).min(1, 'Odaberite materijal.').max(100),
    audience,
  })
  .strict()

export const moveMaterialToLessonSchema = z
  .object({
    materialId: z.string().min(1),
    lessonId: z.string().min(1),
  })
  .strict()
