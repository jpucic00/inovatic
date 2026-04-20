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

// Strict schema used when publishing or doing a full manual save. Title +
// slug must be present so the article is actually usable.
export const updateArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(slugRegex, 'Slug smije sadržavati samo mala slova, brojeve i crtice.'),
  ...coreFields,
})

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

export const articleFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['ALL', 'PUBLISHED', 'DRAFT']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type UpdateArticleInput = z.infer<typeof updateArticleSchema>
export type AutosaveArticleInput = z.infer<typeof autosaveArticleSchema>
export type ArticleFiltersInput = z.infer<typeof articleFiltersSchema>

/** Derive a URL-safe slug from a title; used for auto-fill in the form. */
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
    .replace(/^-|-$/g, '')
}
