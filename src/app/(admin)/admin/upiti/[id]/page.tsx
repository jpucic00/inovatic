import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, RotateCcw, CalendarCheck, PartyPopper } from 'lucide-react'
import { BackToListLink } from '@/components/admin/back-to-list-link'
import { requireAdmin } from '@/lib/auth-guard'
import {
  getInquiry,
  getInquiryCourses,
  getGroupsForCourse,
  getReturningStudentInfo,
} from '@/actions/admin/inquiry'
import { InquiryStatusBadge } from '@/components/admin/inquiries/inquiry-status-badge'
import { InquiryTypeBadge } from '@/components/admin/inquiries/inquiry-type-badge'
import { ReturningBadge } from '@/components/admin/returning-badge'
import { DeclineDialog } from '@/components/admin/inquiries/decline-dialog'
import { DeleteDialog } from '@/components/admin/inquiries/delete-dialog'
import { SendScheduleDialog } from '@/components/admin/inquiries/send-schedule-dialog'
import { CreateAccountDialog } from '@/components/admin/inquiries/create-account-dialog'
import { SchedulePartyDialog } from '@/components/admin/inquiries/schedule-party-dialog'
import {
  INQUIRY_STATUS_LABELS,
  STATUS_FLOW,
  GRADE_LABELS,
  NO_SUITABLE_TERMIN_LABEL,
} from '@/lib/inquiry-status'
import { offersPaymentOption, paymentOptionLabel } from '@/lib/payment-option'
import { formatChildName, formatDate, formatDateTime, formatTime } from '@/lib/format'
import { toDateKey } from '@/lib/session-dates'
import type { ProgramKind } from '@prisma/client'

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

/**
 * Detail view for a PARTY (proslava) inquiry — a distinct layout from the
 * course flow: no child/course/returning-student, and the primary action is
 * "Dogovori termin" (schedule a date+time) rather than creating a student.
 */
function PartyInquiryDetail({
  inquiry,
}: Readonly<{ inquiry: NonNullable<Awaited<ReturnType<typeof getInquiry>>> }>) {
  const isDeclined = inquiry.status === 'DECLINED'
  const isScheduled = inquiry.status === 'PARTY_SCHEDULED'
  const canDecline = !isDeclined && !isScheduled

  const proposedIso = inquiry.partyProposedDate ? toDateKey(inquiry.partyProposedDate) : ''
  const confirmedIso = inquiry.partyConfirmedDate ? toDateKey(inquiry.partyConfirmedDate) : ''
  const proposedLabel = inquiry.partyProposedDate ? formatDate(inquiry.partyProposedDate) : null
  const confirmedLabel = inquiry.partyConfirmedDate ? formatDate(inquiry.partyConfirmedDate) : null
  const partyTimeSuffix = inquiry.partyStartTime ? ` u ${inquiry.partyStartTime}` : ''
  const confirmedTermin = confirmedLabel ? `${confirmedLabel}${partyTimeSuffix}` : '–'

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <BackToListLink listPath="/admin/upiti" label="Natrag na upite" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PartyPopper className="w-6 h-6 text-fuchsia-500" />
            Upit za proslavu
          </h1>
          <p className="text-gray-500 text-sm mt-1">Upit primljen {formatDateTime(inquiry.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <InquiryTypeBadge type={inquiry.type} className="text-sm px-3 py-1" />
          <InquiryStatusBadge status={inquiry.status} className="text-sm px-3 py-1" />
        </div>
      </div>

      {/* Scheduled / declined banner */}
      {isScheduled && confirmedLabel && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <CalendarCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-emerald-900">Termin dogovoren</h2>
              <p className="text-sm text-emerald-800 mt-1">
                Proslava je zakazana za <strong>{confirmedLabel}</strong>
                {inquiry.partyStartTime ? (
                  <>
                    {' '}
                    u <strong>{inquiry.partyStartTime}</strong>
                  </>
                ) : null}
                . Prikazuje se u kalendaru školske godine.
              </p>
            </div>
          </div>
        </div>
      )}
      {isDeclined && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <p className="text-sm text-red-600 font-medium">Upit je odbijen.</p>
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-red-700">
              Razlog odbijanja
            </div>
            {inquiry.declineReason ? (
              <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{inquiry.declineReason}</p>
            ) : (
              <p className="mt-1 text-sm italic text-gray-500">Razlog nije zabilježen.</p>
            )}
          </div>
        </div>
      )}

      {/* Parent info */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Podaci o roditelju</h2>
        <dl>
          <DetailRow label="Ime i prezime" value={inquiry.parentName} />
          <DetailRow
            label="E-mail"
            value={
              <a href={`mailto:${inquiry.parentEmail}`} className="text-cyan-700 hover:underline">
                {inquiry.parentEmail}
              </a>
            }
          />
          <DetailRow
            label="Telefon"
            value={
              <a href={`tel:${inquiry.parentPhone}`} className="text-cyan-700 hover:underline">
                {inquiry.parentPhone}
              </a>
            }
          />
        </dl>
      </div>

      {/* Party details */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Detalji proslave</h2>
        <dl>
          <DetailRow
            label="Predloženi datum"
            value={proposedLabel ?? <span className="text-gray-400 italic">Nije naveden</span>}
          />
          {isScheduled && (
            <DetailRow label="Dogovoreni termin" value={confirmedTermin} />
          )}
          <DetailRow
            label="Poruka"
            value={inquiry.message || <span className="text-gray-400 italic">Nije navedena</span>}
          />
          <DetailRow
            label="Pristanak (GDPR)"
            value={
              inquiry.consentGivenAt ? (
                `Dan ${formatDateTime(inquiry.consentGivenAt)}`
              ) : (
                <span className="text-gray-400 italic">Nije zabilježen</span>
              )
            }
          />
        </dl>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isDeclined && (
          <SchedulePartyDialog
            inquiryId={inquiry.id}
            initialDate={confirmedIso || proposedIso}
            initialTime={inquiry.partyStartTime ?? ''}
            isRescheduling={isScheduled}
          />
        )}
        {canDecline && <DeclineDialog inquiryId={inquiry.id} childName={inquiry.parentName} />}
        <DeleteDialog inquiryId={inquiry.id} childName={inquiry.parentName} />
      </div>
    </div>
  )
}

export default async function InquiryDetailPage({ params }: Readonly<PageProps>) {
  await requireAdmin()

  const { id } = await params
  const inquiry = await getInquiry(id)

  if (!inquiry) notFound()

  if (inquiry.type === 'PARTY') {
    return <PartyInquiryDetail inquiry={inquiry} />
  }

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
    dateStart: string | null
    dateEnd: string | null
    startTime: string | null
    endTime: string | null
    availableSpots: number
    isFull: boolean
    reservedByThisInquiry: boolean
    location: { name: string }
    course: {
      title: string
      kind: ProgramKind
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
    dateStart: sg.dateStart,
    dateEnd: sg.dateEnd,
    startTime: sg.startTime,
    endTime: sg.endTime,
    availableSpots: sg.availableSpots,
    isFull: sg.isFull,
    reservedByThisInquiry: sg.reservedByThisInquiry,
    location: { name: sg.location.name },
    course: { title: sg.course.title, kind: sg.course.kind, modules: sg.course.modules },
  })

  // The inquiry's own NEW reservation is excluded from the counts (and the
  // group holding it flagged) — see getGroupsForCourse: without this, a group
  // full only of reservations grays out the very conversion that would free one.
  const groupsForInitial = inquiry.courseId
    ? await getGroupsForCourse(inquiry.courseId, inquiry.id)
    : []
  const courseGroups = groupsForInitial.map(toGroupOption)
  const allCourses = await getInquiryCourses()

  // Returning-student detection: a child (name + DOB) already in the system,
  // other than the account this inquiry itself created. Parent email feeds the
  // legacy fallback for DOB-less imported accounts.
  const returningStudent = await getReturningStudentInfo({
    firstName: inquiry.childFirstName ?? '',
    lastName: inquiry.childLastName ?? '',
    dateOfBirth: inquiry.childDateOfBirth,
    parentEmail: inquiry.parentEmail,
    excludeStudentId: inquiry.studentId,
  })

  const returningDob = returningStudent?.dateOfBirth
    ? formatDate(new Date(returningStudent.dateOfBirth))
    : null

  const birthInfo: React.ReactNode = inquiry.childDateOfBirth
    ? formatDate(new Date(inquiry.childDateOfBirth))
    : <span className="text-gray-400 italic">Nije navedeno</span>

  const preferredProgram: React.ReactNode = inquiry.course
    ? inquiry.course.title
    : <span className="text-gray-400 italic">Nije navedeno</span>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <BackToListLink listPath="/admin/upiti" label="Natrag na upite" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {formatChildName(inquiry)}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Upit primljen{' '}
            {formatDate(inquiry.createdAt)}
            {' u '}
            {formatTime(inquiry.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {returningStudent && <ReturningBadge className="text-sm px-3 py-1" />}
          <InquiryStatusBadge status={inquiry.status} className="text-sm px-3 py-1" />
        </div>
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
                {formatDate(inquiry.updatedAt)}
                {' u '}
                {formatTime(inquiry.updatedAt)}
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

      {/* Returning student (child already in the system) */}
      {returningStudent && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-violet-900">
                Ponovni upis — dijete je već u sustavu
              </h2>
              <p className="text-sm text-violet-800 mt-1">
                Učenik{' '}
                <span className="font-medium">
                  {returningStudent.firstName} {returningStudent.lastName}
                </span>
                {returningDob ? ` (r. ${returningDob})` : ''} već je u sustavu.
                Prije upisa u novu grupu provjerite u koje je grupe dijete već
                upisano.
              </p>

              {returningStudent.history.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {returningStudent.history.map((h) => (
                    <div key={h.schoolYear}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                        {h.schoolYear}
                      </div>
                      <ul className="mt-0.5 space-y-0.5">
                        {h.groups.map((g) => (
                          <li
                            key={`${g.courseTitle}|${g.groupName ?? ''}|${g.locationName}`}
                            className="text-sm text-gray-800"
                          >
                            {[g.courseTitle, g.groupName, g.locationName]
                              .filter(Boolean)
                              .join(' · ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm italic text-violet-700">
                  Bez prijašnjih upisa u grupe.
                </p>
              )}

              <Link
                href={`/admin/ucenici/${returningStudent.id}`}
                className="inline-block mt-4 text-sm text-cyan-700 hover:underline font-medium"
              >
                Pogledaj profil učenika →
              </Link>
            </div>
          </div>
        </div>
      )}

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
              value={
                inquiry.childGrade in GRADE_LABELS
                  ? GRADE_LABELS[inquiry.childGrade as keyof typeof GRADE_LABELS]
                  : inquiry.childGrade
              }
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
          {/* The parent's other possible answer to the same question, rendered
              in the same row: none of the offered termini worked for them, so
              this upit needs a termin agreed before an account is created. */}
          {!inquiry.scheduledGroup && inquiry.noSuitableTermin && (
            <DetailRow
              label="Željeni termin"
              value={
                <span className="font-medium text-amber-700">{NO_SUITABLE_TERMIN_LABEL}</span>
              }
            />
          )}
          {/* The parent's answer on the sign-up form. Advisory at that point —
              the binding choice is the one recorded on the enrollment once an
              account exists.

              Rendered whenever the PROGRAM asks the question, not only when an
              answer exists: the permissive gate deliberately files an SLR upit
              with paymentOption null when the availability feed flickers
              mid-form, and staff are meant to chase that answer — a row reading
              "Nije navedeno" is the prompt to do it at the point of decision.
              A radionica or natjecateljski upit was never asked (they settle by
              akontacija and by month), so those stay rowless — an italic "Nije
              navedeno" there would invite staff to chase an answer that does
              not exist for that program. The answer-exists arm is a safety net:
              a stored option renders even if the course link is missing, so
              this can never hide what the old gate showed. */}
          {(inquiry.paymentOption ||
            (inquiry.course && offersPaymentOption(inquiry.course.kind))) && (
            <DetailRow
              label="Način plaćanja"
              value={
                paymentOptionLabel(inquiry.paymentOption) ?? (
                  <span className="text-gray-400 italic">Nije navedeno</span>
                )
              }
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
                  {formatDate(inquiry.consentGivenAt)}{' '}
                  u{' '}
                  {formatTime(inquiry.consentGivenAt)}
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
