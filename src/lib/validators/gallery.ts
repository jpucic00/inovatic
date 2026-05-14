import { z } from 'zod'

const galleryImagePayloadSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  caption: z
    .union([z.literal(''), z.string().max(500)])
    .optional()
    .nullable(),
})

export const addGalleryImagesSchema = z.object({
  scheduledGroupId: z.string().min(1),
  moduleId: z.string().min(1).nullable(),
  images: z.array(galleryImagePayloadSchema).min(1).max(50),
})

export type AddGalleryImagesInput = z.infer<typeof addGalleryImagesSchema>
