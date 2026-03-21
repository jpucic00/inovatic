import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getInquiry } from '@/actions/admin/inquiry'
import { InquiryStatusBadge } from '@/components/admin/inquiries/inquiry-status-badge'
import { DeclineDialog } from '@/components/admin/inquiries/decline-dialog'
import { DeleteDialog } from '@/components/admin/inquiries/delete-dialog'
import {
  INQUIRY_STATUS_LABELS,
  COURSE_LEVEL_LABELS,
  STATUS_FLOW,
} from '@/lib/inquiry-status'
import { formatChildName } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin – Upit' }

interface PageProps {
  params: Promise<{ id: string }>
}

function DetailRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b last:border-b-0">
      <dt className="text-sm font-medium text-gray-500 sm:w-44 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value}</dd>
    </div>
  )
}

function StatusTimeline({ currentStatus }: Readonly<{ currentStatus: string }>) {
  const currentIdx = STATUS_FLOW.indexOf(currentStatus as (typeof STATUS_FLOW)[number])
  const isDeclined = currentStatus === 'DECLINED'

  return (
    <div className="flex items-center gap-0">
      {STATUS_FLOW.map((step, idx) => {
        const isDone = !isDeclined && currentIdx >= idx
        const isCurrent = !isDeclined && currentIdx === idx
        let circleClass: string
        if (isDeclined) {
          circleClass = 'bg-gray-100 border-gray-200 text-gray-400'
        } else if (isDone && !isCurrent) {
          circleClass = 'bg-cyan-600 border-cyan-600 text-white'
        } else if (isCurrent) {
          circleClass = 'bg-white border-cyan-600 text-cyan-600 font-bold'
        } else {
          circleClass = 'bg-white border-gray-200 text-gray-400'
        }
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={[
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-colors',
                  circleClass,
                ].join(' ')}
              >
                {isDone && !isCurrent ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              <span
                className={[
                  'text-xs mt-1 text-center w-20',
                  isCurrent && !isDeclined ? 'text-cyan-700 font-medium' : 'text-gray-400',
                ].join(' ')}
              >
                {INQUIRY_STATUS_LABELS[step]}
              </span>
            </div>
            {idx < STATUS_FLOW.length - 1 && (
              <div
                className={[
                  'h-0.5 w-8 mb-5 mx-1',
                  isDeclined || currentIdx <= idx ? 'bg-gray-200' : 'bg-cyan-600',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default async function InquiryDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const inquiry = await getInquiry(id)

  if (!inquiry) notFound()

  const isDeclined = inquiry.status === 'DECLINED'
  const isAccountCreated = inquiry.status === 'ACCOUNT_CREATED'
  const canDecline = !isDeclined && !isAccountCreated

  let birthInfo: React.ReactNode
  if (inquiry.childDateOfBirth) {
    birthInfo = new Date(inquiry.childDateOfBirth).toLocaleDateString('hr-HR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } else if (inquiry.childAge == null) {
    birthInfo = <span className="text-gray-400 italic">Nije navedeno</span>
  } else {
    birthInfo = `${inquiry.childAge} god.`
  }

  let preferredProgram: React.ReactNode
  if (inquiry.course) {
    preferredProgram = inquiry.course.title
  } else if (inquiry.courseLevelPref) {
    preferredProgram = COURSE_LEVEL_LABELS[inquiry.courseLevelPref] ?? inquiry.courseLevelPref
  } else {
    preferredProgram = <span className="text-gray-400 italic">Nije navedeno</span>
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/upiti"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Natrag na upite
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {formatChildName(inquiry)}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Upit primljen{' '}
            {inquiry.createdAt.toLocaleDateString('hr-HR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
            {' u '}
            {inquiry.createdAt.toLocaleTimeString('hr-HR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <InquiryStatusBadge status={inquiry.status} className="text-sm px-3 py-1" />
      </div>

      {/* Status timeline */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-5">Tijek upita</h2>
        <StatusTimeline currentStatus={inquiry.status} />
        {isDeclined && (
          <p className="mt-4 text-sm text-red-600 font-medium">Upit je odbijen.</p>
        )}
      </div>

      {/* Parent info */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Podaci o roditelju</h2>
        <dl>
          <DetailRow label="Ime i prezime" value={inquiry.parentName} />
          <DetailRow
            label="E-mail"
            value={
              <a
                href={`mailto:${inquiry.parentEmail}`}
                className="text-cyan-700 hover:underline"
              >
                {inquiry.parentEmail}
              </a>
            }
          />
          <DetailRow
            label="Telefon"
            value={
              <a
                href={`tel:${inquiry.parentPhone}`}
                className="text-cyan-700 hover:underline"
              >
                {inquiry.parentPhone}
              </a>
            }
          />
        </dl>
      </div>

      {/* Child info */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Podaci o djetetu</h2>
        <dl>
          <DetailRow
            label="Ime i prezime"
            value={formatChildName(inquiry, '') || <span className="text-gray-400 italic">Nije navedeno</span>}
          />
          <DetailRow label="Datum rođenja" value={birthInfo} />
          {inquiry.childSchool && (
            <DetailRow label="Škola" value={inquiry.childSchool} />
          )}
        </dl>
      </div>

      {/* Preferences */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Preferencije</h2>
        <dl>
          <DetailRow label="Željeni program" value={preferredProgram} />
          {inquiry.scheduledGroup && (() => {
            const sg = inquiry.scheduledGroup
            const timeWithEnd = sg.endTime ? `${sg.startTime}–${sg.endTime}` : sg.startTime
            const timeRange = sg.startTime ? timeWithEnd : null
            return (
              <DetailRow
                label="Željeni termin"
                value={
                  <span>
                    {[sg.name, sg.dayOfWeek, timeRange, sg.location.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                }
              />
            )
          })()}
          {!inquiry.scheduledGroup && (
            <DetailRow
              label="Željena lokacija"
              value={inquiry.locationPref || <span className="text-gray-400 italic">Nije navedeno</span>}
            />
          )}
          <DetailRow
            label="Poruka"
            value={
              inquiry.message || <span className="text-gray-400 italic">Nije navedena</span>
            }
          />
          <DetailRow
            label="Pristanak (GDPR)"
            value={
              inquiry.consentGivenAt ? (
                <span>
                  Dan{' '}
                  {inquiry.consentGivenAt.toLocaleDateString('hr-HR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}{' '}
                  u{' '}
                  {inquiry.consentGivenAt.toLocaleTimeString('hr-HR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : (
                <span className="text-gray-400 italic">Nije zabilježen</span>
              )
            }
          />
        </dl>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {canDecline && (
          <DeclineDialog inquiryId={inquiry.id} childName={formatChildName(inquiry)} />
        )}
        <DeleteDialog inquiryId={inquiry.id} childName={formatChildName(inquiry)} />
      </div>
    </div>
  )
}
