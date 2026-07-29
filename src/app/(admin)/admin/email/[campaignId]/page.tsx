import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getCampaignDetail } from '@/actions/admin/email-campaign'
import { CampaignRecipients } from '@/components/admin/email/campaign-recipients'
import { EMAIL_CAMPAIGN_KINDS } from '@/lib/email-campaign-kind'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin – Detalji kampanje' }

export default async function CampaignDetailPage({
  params,
}: Readonly<{ params: Promise<{ campaignId: string }> }>) {
  await requireAdminCtx()
  const { campaignId } = await params
  const campaign = await getCampaignDetail(campaignId)

  const sender = `${campaign.sentBy.firstName} ${campaign.sentBy.lastName}`
  const kindLabel = EMAIL_CAMPAIGN_KINDS[campaign.kind].label

  return (
    <div>
      <Link
        href="/admin/email"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na e-mail
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{campaign.subject}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {kindLabel} · poslao/la {sender} · {formatDate(campaign.createdAt)}
          {campaign.targetCourse ? ` · ${campaign.targetCourse.title}` : ''}
          {campaign.targetSchoolYear ? ` · ${campaign.targetSchoolYear}` : ''}
        </p>
      </div>

      <CampaignRecipients campaign={campaign} />
    </div>
  )
}
