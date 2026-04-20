import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-guard'
import { createDraftArticle } from '@/actions/admin/article'

// Clicking "Novi članak" lands here, we immediately create a draft row and
// redirect into its edit view so auto-save can take over from step one.
// No UI is rendered; this route is purely a passthrough.
export default async function NewArticlePage() {
  await requireAdmin()
  const res = await createDraftArticle()
  if (!res.success) throw new Error(res.error)
  if (!res.articleId) throw new Error('Neuspješno kreiranje skice.')
  redirect(`/admin/novosti/${res.articleId}/uredi`)
}
