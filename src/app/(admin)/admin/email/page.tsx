import type { Metadata } from 'next'
import { requireAdminCtx } from '@/lib/auth-guard'
import { getSelectedSchoolYear } from '@/lib/school-year-cookie'
import { getPreviousSchoolYear, isArchivedYear } from '@/lib/school-year'
import { getAllSchoolYears } from '@/actions/admin/school-year'
import { getInquiryCourses } from '@/actions/admin/inquiry'
import { getRecommendationOptions } from '@/lib/student-detail'
import { getEmailCampaigns, getEmailGroupTree } from '@/actions/admin/email-campaign'
import { EmailWizard } from '@/components/admin/email/email-wizard'
import { CampaignHistory } from '@/components/admin/email/campaign-history'
import { ArchivedYearBanner } from '@/components/admin/archived-year-banner'

export const metadata: Metadata = { title: 'Admin – E-mail' }

export default async function EmailPage() {
  await requireAdminCtx()

  const selectedYear = await getSelectedSchoolYear()
  const previousYear = getPreviousSchoolYear(selectedYear)

  const [years, targetCourses, initialTree, campaigns, recommendationOptions] = await Promise.all([
    getAllSchoolYears(),
    getInquiryCourses(),
    // The wizard mounts on the custom kind with the selected year — preload
    // that tree so step 2 paints without a fetch.
    getEmailGroupTree(selectedYear, false),
    getEmailCampaigns(),
    // The full PREPORUKA option set (each SLR course + the special tracks) —
    // the same feed the report-card dropdown uses.
    getRecommendationOptions(),
  ])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">E-mail</h1>
        <p className="text-gray-500 text-sm mt-1">
          Grupno slanje e-mail poruka roditeljima polaznika
        </p>
      </div>

      {isArchivedYear(selectedYear) && <ArchivedYearBanner year={selectedYear} />}

      <EmailWizard
        years={years}
        selectedYear={selectedYear}
        previousYear={previousYear}
        targetCourses={targetCourses}
        initialTree={initialTree}
        recommendationOptions={recommendationOptions}
      />

      <CampaignHistory campaigns={campaigns} />
    </div>
  )
}
