import { z } from 'zod'

// ─── Shared core fields ──────────────────────────────────────────────────────

const urlOrEmpty = z.union([z.literal(''), z.string().url()]).optional().nullable()

const commonCreate = {
  title: z.string().trim().min(2).max(200),
  description: z
    .union([z.literal(''), z.string().max(2000)])
    .optional()
    .nullable(),
  type: z.enum(['DOCUMENT', 'PRESENTATION', 'VIDEO', 'LINK']),
  fileUrl: urlOrEmpty,
  externalUrl: urlOrEmpty,
  fileSize: z.number().int().nonnegative().optional().nullable(),
  mimeType: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
}

// ─── Scope variants (discriminated union) ────────────────────────────────────

const moduleVariant = z
  .object({
    scope: z.literal('MODULE'),
    moduleId: z.string().min(1, 'Odaberite modul'),
    ...commonCreate,
  })
  .strict()

const courseVariant = z
  .object({
    scope: z.literal('COURSE'),
    courseId: z.string().min(1, 'Odaberite program'),
    ...commonCreate,
  })
  .strict()

const groupVariant = z
  .object({
    scope: z.literal('GROUP'),
    scheduledGroupId: z.string().min(1, 'Odaberite grupu'),
    ...commonCreate,
  })
  .strict()

export const createMaterialSchema = z
  .discriminatedUnion('scope', [moduleVariant, courseVariant, groupVariant])
  .superRefine((val, ctx) => validateTypeUrlPairing(val, ctx))

// Update is the same three scope variants, but with `id` required and most
// fields optional. Keeping it as a partial-like pattern is simpler than a full
// discriminatedUnion here because scope + FK cannot change after creation.
export const updateMaterialSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(2).max(200).optional(),
    description: z
      .union([z.literal(''), z.string().max(2000)])
      .optional()
      .nullable(),
    type: z.enum(['DOCUMENT', 'PRESENTATION', 'VIDEO', 'LINK']).optional(),
    fileUrl: urlOrEmpty,
    externalUrl: urlOrEmpty,
    fileSize: z.number().int().nonnegative().optional().nullable(),
    mimeType: z.string().max(200).optional().nullable(),
    sortOrder: z.number().int().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.type) {
      validateTypeUrlPairing(
        { type: val.type, fileUrl: val.fileUrl ?? null, externalUrl: val.externalUrl ?? null },
        ctx,
      )
    }
  })

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>

// ─── Shared helpers ──────────────────────────────────────────────────────────

const ALLOWED_VIDEO_HOSTS = [
  /(?:^|\.)youtube\.com$/i,
  /(?:^|\.)youtu\.be$/i,
  /(?:^|\.)vimeo\.com$/i,
]

export function isAllowedExternalVideoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ALLOWED_VIDEO_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

function nonEmpty(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.length > 0
}

function validateTypeUrlPairing(
  val: { type: 'DOCUMENT' | 'PRESENTATION' | 'VIDEO' | 'LINK'; fileUrl?: string | null; externalUrl?: string | null },
  ctx: z.RefinementCtx,
) {
  const hasFile = nonEmpty(val.fileUrl)
  const hasExternal = nonEmpty(val.externalUrl)

  if (val.type === 'VIDEO') {
    // Exactly one of fileUrl OR externalUrl; externalUrl must be YT/Vimeo.
    if (hasFile && hasExternal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Za video materijal ne unosite i datoteku i poveznicu — samo jedno.',
        path: ['externalUrl'],
      })
    } else if (!hasFile && !hasExternal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Priložite video datoteku ili unesite poveznicu (YouTube/Vimeo).',
        path: ['fileUrl'],
      })
    } else if (hasExternal && !isAllowedExternalVideoUrl(val.externalUrl as string)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Poveznica mora biti sa YouTube ili Vimeo.',
        path: ['externalUrl'],
      })
    }
    return
  }

  if (val.type === 'LINK') {
    // LINK stores the URL in externalUrl (not uploaded to Cloudinary).
    if (!hasExternal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unesite URL poveznice.',
        path: ['externalUrl'],
      })
    }
    if (hasFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Poveznica ne smije imati priloženu datoteku.',
        path: ['fileUrl'],
      })
    }
    return
  }

  // DOCUMENT and PRESENTATION require a fileUrl (Cloudinary raw upload).
  if (!hasFile) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Priložite datoteku.',
      path: ['fileUrl'],
    })
  }
  if (hasExternal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Vanjska poveznica nije dozvoljena za ovaj tip — koristi LINK tip.',
      path: ['externalUrl'],
    })
  }
}
