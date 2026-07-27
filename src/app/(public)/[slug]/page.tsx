import { notFound, permanentRedirect } from 'next/navigation'
import { db } from '@/lib/db'
import { couldBeArticleSlug, WP_REDIRECTS } from '@/lib/wp-redirects'

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>

/**
 * Legacy WordPress URL catcher. The old site served posts AND pages from the
 * domain root, so this dynamic segment keeps every pre-cutover link alive:
 * explicit page/alias map first, then migrated articles (slugs preserved 1:1
 * — the lookup covers all 70 of them without a hardcoded list), everything
 * else 404s. Static sibling routes always win over this segment, so live
 * pages like /o-nama or /donacije never reach it.
 */
export default async function LegacyWpRedirect({ params }: PageProps) {
  const { slug } = await params

  const mapped = WP_REDIRECTS[slug]
  if (mapped) permanentRedirect(mapped)

  // Cheap shape check before the only DB hit on this route.
  if (!couldBeArticleSlug(slug)) notFound()

  const article = await db.article.findUnique({
    where: { slug, isPublished: true },
    select: { slug: true },
  })
  if (article) permanentRedirect(`/novosti/${article.slug}`)

  notFound()
}
