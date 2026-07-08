import { db } from '@/lib/db'
import { slugifyTitle } from '@/lib/validators/admin/article'
import type { PrismaClient } from '@prisma/client'

type TxClient = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

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
