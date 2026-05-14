import { z } from 'zod'

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const coreFields = {
  excerpt: z.string().max(500).optional().nullable(),
  coverImage: z
    .union([z.literal(''), z.string().url()])
    .optional()
    .nullable(),
  // BlockNote content is an array of PartialBlock — validated as an array of
  // objects. The renderer and editor tolerate legacy shapes.
  content: z.array(z.unknown()),
  tagNames: z.array(z.string().min(1).max(40)).optional().default([]),
  isPublished: z.boolean().optional().default(false),
}

// Relaxed schema for auto-save on drafts. Title may be empty (admins type
// incrementally), slug still enforced so the URL stays well-formed, and
// isPublished is never accepted here — publishing is an explicit action.
export const autosaveArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(slugRegex, 'Slug smije sadržavati samo mala slova, brojeve i crtice.'),
  excerpt: coreFields.excerpt,
  coverImage: coreFields.coverImage,
  content: coreFields.content,
  tagNames: coreFields.tagNames,
})

export type AutosaveArticleInput = z.infer<typeof autosaveArticleSchema>

/** Derive a URL-safe slug from a title; used for auto-fill in the form. */
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replaceAll(/[čć]/g, 'c')
    .replaceAll('š', 's')
    .replaceAll('ž', 'z')
    .replaceAll('đ', 'd')
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 100)
    .replaceAll(/(?:^-|-$)/g, '')
}
