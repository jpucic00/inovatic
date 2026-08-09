import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth-guard'
import { BackToListLink } from '@/components/admin/back-to-list-link'
import { getArticle } from '@/actions/admin/article'
import { getAllTags } from '@/actions/admin/tag'
import { ArticleForm } from '@/components/admin/articles/article-form'
import { DeleteArticleButton } from '@/components/admin/articles/delete-article-button'

export const metadata: Metadata = { title: 'Admin – Uredi članak' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditArticlePage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const [article, tags] = await Promise.all([getArticle(id), getAllTags()])

  if (!article) notFound()

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <BackToListLink listPath="/admin/novosti" label="Natrag na članke" />
        <DeleteArticleButton
          articleId={article.id}
          articleTitle={article.title}
          redirectOnDelete
        />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Uredi članak</h1>

      <ArticleForm
        initial={{
          id: article.id,
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          coverImage: article.coverImage,
          content: article.content,
          isPublished: article.isPublished,
          publishedAt: article.publishedAt,
          city: article.city,
          tags: article.tags,
          images: article.images.map((i) => ({
            id: i.id,
            url: i.url,
            caption: i.caption,
            sortOrder: i.sortOrder,
          })),
        }}
        availableTags={tags}
      />
    </div>
  )
}
