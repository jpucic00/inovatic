import type { Metadata } from 'next'
import { ClipboardCheck } from 'lucide-react'
import { getMyAssessmentForGroup } from '@/actions/student/assessment'
import { AssessmentReadonly } from '@/components/portal/assessment-readonly'

export const metadata: Metadata = { title: 'Evaluacija polaznika' }

function Notice({ title, body }: Readonly<{ title: string; body: string }>) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-11 text-center">
      <span className="mb-3.5 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
        <ClipboardCheck className="h-7 w-7" />
      </span>
      <p className="mb-1 text-base font-semibold text-gray-900">{title}</p>
      <p className="mx-auto max-w-md text-sm leading-relaxed text-gray-500">{body}</p>
    </div>
  )
}

export default async function PortalGroupEvaluacijaPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const { gradable, assessment, kind } = await getMyAssessmentForGroup(groupId)

  // The tab is not offered for a radionica, so this is the direct-URL case.
  if (!gradable) {
    return (
      <Notice
        title="Ova grupa se ne ocjenjuje"
        body="Radionice nemaju evaluaciju — ocjenjuju se samo programi koji traju kroz školsku godinu."
      />
    )
  }

  if (!assessment) {
    return (
      <Notice
        title="Evaluacija još nije dostupna"
        body="Mentor je ispunjava tijekom programa, a konačna ocjena i preporuka za sljedeću razinu vidljive su po završetku godine."
      />
    )
  }

  return (
    <div className="max-w-3xl">
      <AssessmentReadonly assessment={assessment} kind={kind} />
    </div>
  )
}
