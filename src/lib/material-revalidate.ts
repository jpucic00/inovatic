import { revalidatePath } from 'next/cache'

/**
 * Every page that renders materials or lessons. A plain module, not an action
 * file: exported from a `'use server'` file this would be a callable endpoint.
 */
export function revalidateMaterialPaths() {
  revalidatePath('/admin/programi', 'layout')
  revalidatePath('/admin/grupe', 'layout')
  revalidatePath('/nastavnik/grupa', 'layout')
  revalidatePath('/nastavnik/prezentacija', 'layout')
  revalidatePath('/portal/grupa', 'layout')
  revalidatePath('/portal')
}
