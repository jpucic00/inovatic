import type { ZodSchema } from 'zod'
import { requireAdmin } from './auth-guard'
import type { AdminActionResult } from './action-types'

/**
 * Wraps plain admin CRUD mutations: guards with requireAdmin, validates input,
 * and surfaces the first Zod issue message on failure. Use only for actions
 * that return AdminActionResult without extra fields.
 */
export async function adminAction<T>(
  schema: ZodSchema<T>,
  data: unknown,
  handler: (data: T) => Promise<AdminActionResult>,
): Promise<AdminActionResult> {
  await requireAdmin()
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nevaljani podaci.' }
  }
  return handler(parsed.data)
}
