import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getMyAssessmentForGroup } from '@/actions/student/assessment'
import { AssessmentReadonly } from '@/components/portal/assessment-readonly'

export const metadata: Metadata = { title: 'Evaluacija polaznika' }

export default async function PortalGroupEvaluacijaPage({
  params,
}: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  const { group, gradable, assessment, kind } = await getMyAssessmentForGroup(groupId)

  return (
    <div className="max-w-2xl">
      <Link
        href={`/portal/grupa/${group.id}`}
        className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Natrag na materijale
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Evaluacija polaznika</h1>
        <p className="text-sm text-gray-500 mt-1">
          {group.courseTitle}
          {group.name ? ` – ${group.name}` : ''}
        </p>
      </header>

      {!gradable && (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Radionice se ne ocjenjuju, pa za ovu grupu nema evaluacije.
        </p>
      )}

      {gradable && !assessment && (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Evaluacija još nije dostupna. Mentor je ispunjava tijekom programa, a
          konačna ocjena i preporuka za sljedeću razinu vidljive su po završetku
          godine.
        </p>
      )}

      {gradable && assessment && (
        <AssessmentReadonly assessment={assessment} kind={kind} />
      )}
    </div>
  )
}
