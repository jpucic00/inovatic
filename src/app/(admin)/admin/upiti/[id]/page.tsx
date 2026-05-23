import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { requireAdmin } from '@/lib/auth-guard'
import { getInquiry, getInquiryCourses, getGroupsForCourse } from '@/actions/admin/inquiry'
import { InquiryStatusBadge } from '@/components/admin/inquiries/inquiry-status-badge'
import { DeclineDialog } from '@/components/admin/inquiries/decline-dialog'
import { DeleteDialog } from '@/components/admin/inquiries/delete-dialog'
import { SendScheduleDialog } from '@/components/admin/inquiries/send-schedule-dialog'
import { CreateAccountDialog } from '@/components/admin/inquiries/create-account-dialog'
import {
  INQUIRY_STATUS_LABELS,
  COURSE_LEVEL_LABELS,
  STATUS_FLOW,
} from '@/lib/inquiry-status'
import { formatChildName } from '@/lib/format'

export const metadata: Metadata = { title: 'Admin – Upit' }

const GRADE_LABELS: Record<string, string> = {
  predskolci: 'Predškolci',
  '1': '1. razred',
  '2': '2. razred',
  '3': '3. razred',
  '4': '4. razred',
  '5': '5. razred',
  '6': '6. razred',
  '7': '7. razred',
  '8': '8. razred',
}

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
  const canSendSchedule = !isDeclined && !isAccountCreated
  const canCreateAccount = !isDeclined && !isAccountCreated

  // Groups for the dropdowns — strip to plain objects (Decimal fields are not serializable).
  // Capacity fields (availableSpots / isFull) come from getGroupsForCourse so the dialogs
  // render "X slobodnih mjesta" / "Popunjeno" immediately on first open without an extra
  // client-side fetch.
  const toGroupOption = (sg: {
    id: string
    name: string | null
    dayOfWeek: string | null
    startTime: string | null
    endTime: string | null
    availableSpots: number
    isFull: boolean
    location: { name: string }
    course: {
      title: string
      isCustom?: boolean
      modules?: {
        id: string
        title: string
        sortOrder: number
        schedules: { id: string; startDate: Date | null; endDate: Date | null }[]
      }[]
    }
  }) => ({
    id: sg.id,
    name: sg.name,
    dayOfWeek: sg.dayOfWeek,
    startTime: sg.startTime,
    endTime: sg.endTime,
    availableSpots: sg.availableSpots,
    isFull: sg.isFull,
    location: { name: sg.location.name },
    course: { title: sg.course.title, isCustom: sg.course.isCustom, modules: sg.course.modules },
  })

  const groupsForInitial = inquiry.courseId
    ? await getGroupsForCourse(inquiry.courseId)
    : []
  const courseGroups = groupsForInitial.map(toGroupOption)
  const allCourses = await getInquiryCourses()

  const birthInfo: React.ReactNode = inquiry.childDateOfBirth
    ? new Date(inquiry.childDateOfBirth).toLocaleDateString('hr-HR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : <span className="text-gray-400 italic">Nije navedeno</span>

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
          <>
            <p className="mt-4 text-sm text-red-600 font-medium">Upit je odbijen.</p>
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Razlog odbijanja
              </div>
              {inquiry.declineReason ? (
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {inquiry.declineReason}
                </p>
              ) : (
                <p className="mt-1 text-sm italic text-gray-500">Razlog nije zabilježen.</p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Odbijeno{' '}
                {inquiry.updatedAt.toLocaleDateString('hr-HR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
                {' u '}
                {inquiry.updatedAt.toLocaleTimeString('hr-HR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </>
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
          {inquiry.childGrade && (
            <DetailRow
              label="Razred"
              value={GRADE_LABELS[inquiry.childGrade] ?? inquiry.childGrade}
            />
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
            label="Izvor saznanja"
            value={
              inquiry.referralSource || <span className="text-gray-400 italic">Nije navedeno</span>
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

      {/* Student link (shown when account created) */}
      {isAccountCreated && inquiry.studentId && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-green-800 mb-2">Račun učenika</h2>
          <Link
            href={`/admin/ucenici/${inquiry.studentId}`}
            className="text-sm text-cyan-700 hover:underline font-medium"
          >
            Pogledaj profil učenika →
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {canSendSchedule && (
          <SendScheduleDialog
            inquiryId={inquiry.id}
            childName={formatChildName(inquiry)}
            initialGroups={courseGroups}
            courses={allCourses}
            preferredCourseId={inquiry.courseId ?? undefined}
          />
        )}
        {canCreateAccount && (
          <CreateAccountDialog
            inquiryId={inquiry.id}
            childName={formatChildName(inquiry)}
            initialGroups={courseGroups}
            courses={allCourses}
            preferredCourseId={inquiry.courseId ?? undefined}
            preferredGroupId={inquiry.scheduledGroupId ?? undefined}
          />
        )}
        {canDecline && (
          <DeclineDialog inquiryId={inquiry.id} childName={formatChildName(inquiry)} />
        )}
        <DeleteDialog inquiryId={inquiry.id} childName={formatChildName(inquiry)} />
      </div>
    </div>
  )
}
