'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { slugifyTitle } from '@/lib/validators/admin/article'
import type { PrismaClient } from '@prisma/client'

type TxClient = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Find-or-create a tag by its display name. Used during article create/update
 * so admins can type a new tag inline without a separate tag-management page.
 */
export async function upsertTagByName(name: string, tx?: TxClient) {
  const client = tx ?? db
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Tag name cannot be empty')

  const slug = slugifyTitle(trimmed)
  if (!slug) throw new Error(`Tag name "${trimmed}" does not produce a valid slug`)

  return client.tag.upsert({
    where: { slug },
    create: { name: trimmed, slug },
    update: {},
    select: { id: true, name: true, slug: true },
  })
}

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
