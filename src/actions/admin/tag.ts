'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'

export async function getAllTags() {
  await requireAdmin()
  const rows = await db.tag.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { articles: true } },
    },
  })

  return rows
    .map((t) => ({ id: t.id, name: t.name, slug: t.slug, count: t._count.articles }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name, 'hr')
    })
}
