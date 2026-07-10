import { notFound } from 'next/navigation'
import type { City } from '@prisma/client'
import { db } from './db'

// Fail-closed row guards for id-based admin operations: an id belonging to
// the other city is indistinguishable from a nonexistent one (404), so
// cross-city probes learn nothing.

export async function assertGroupInCity(groupId: string, city: City): Promise<void> {
  const row = await db.scheduledGroup.findUnique({
    where: { id: groupId },
    select: { city: true },
  })
  if (!row || row.city !== city) notFound()
}

export async function assertUserInCity(userId: string, city: City): Promise<void> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { city: true },
  })
  if (!row || row.city !== city) notFound()
}

export async function assertInquiryInCity(inquiryId: string, city: City): Promise<void> {
  const row = await db.inquiry.findUnique({
    where: { id: inquiryId },
    select: { city: true },
  })
  if (!row || row.city !== city) notFound()
}

export async function assertArticleInCity(articleId: string, city: City): Promise<void> {
  const row = await db.article.findUnique({
    where: { id: articleId },
    select: { city: true },
  })
  if (!row || row.city !== city) notFound()
}
