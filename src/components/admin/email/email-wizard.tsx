'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Send } from 'lucide-react'
import { croatianPlural, formatGroupSchedule } from '@/lib/format'
import { isRadionica } from '@/lib/program-kind'
import type { RecommendationOption } from '@/lib/assessment-rubric'
import { SKIP_REASON_SHORT } from '@/lib/bulk-email-recipients'
import {
  EMAIL_CAMPAIGN_KINDS,
  EMAIL_CAMPAIGN_KIND_ORDER,
} from '@/lib/email-campaign-kind'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'
import { getGroupsForCourse } from '@/actions/admin/inquiry'
import {
  getCampaignProgress,
  getEmailGroupTree,
  previewEmailHtml,
  previewEmailRecipients,
  previewEvaluationEmailForRecipient,
  sendEmailCampaign,
  type PreviewRecipientsResult,
  type SendEmailCampaignResult,
} from '@/actions/admin/email-campaign'
import { EmailPreviewDialog } from './email-preview-dialog'

type StartedSend = Extract<SendEmailCampaignResult, { success: true }>

/**
 * The send runs on the server, so this polls rather than holding the request
 * open — the admin can close the tab and the campaign still completes.
 */
function SendProgressPanel({ result }: Readonly<{ result: StartedSend }>) {
  const [progress, setProgress] = useState({
    sentCount: 0,
    failedCount: 0,
    finished: result.total === 0,
  })

  useEffect(() => {
    if (progress.finished) return
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const next = await getCampaignProgress(result.campaignId)
        if (cancelled) return
        setProgress({
          sentCount: next.sentCount,
          failedCount: next.failedCount,
          finished: next.finished,
        })
      } catch {
        // A transient failure just means the next tick tries again.
      }
    }, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [result.campaignId, progress.finished])

  const done = progress.sentCount + progress.failedCount
  const pct = result.total === 0 ? 100 : Math.round((done / result.total) * 100)

  return (
    <div
      className={[
        'mt-4 rounded-lg border p-4 text-sm text-gray-800',
        progress.finished ? 'border-green-200 bg-green-50' : 'border-cyan-200 bg-cyan-50',
      ].join(' ')}
      aria-live="polite"
    >
      <p className="font-medium mb-1">
        {progress.finished ? 'Kampanja poslana' : 'Slanje u tijeku…'}
      </p>
      {!progress.finished && (
        <>
          <div className="h-1.5 w-full rounded-full bg-white overflow-hidden mb-2">
            <div className="h-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-600 mb-1">
            Slanje se nastavlja na poslužitelju — možete zatvoriti ovu stranicu.
          </p>
        </>
      )}
      <p>
        Poslano: {progress.sentCount} / {result.total} · Neuspješno: {progress.failedCount} · Već
        poslano ranije: {result.alreadySent} · Isključeno: {result.excluded} · Preskočeno:{' '}
        {result.skipped.length}
      </p>
      <a
        href={`/admin/email/${result.campaignId}`}
        className="mt-2 inline-block font-medium text-cyan-700 hover:text-cyan-800 underline"
      >
        Detalji kampanje — tko je primio poruku
      </a>
    </div>
  )
}

type Kind = 'CUSTOM' | 'REENROLLMENT' | 'EVALUATION'
type SelectionMode = 'GROUPS' | 'RECOMMENDATION'
type GroupTree = Awaited<ReturnType<typeof getEmailGroupTree>>
type RecipientData = Extract<PreviewRecipientsResult, { success: true }>
type SendSuccess = Extract<SendEmailCampaignResult, { success: true }>

interface TargetGroup {
  id: string
  label: string
  availableSpots: number
  isFull: boolean
}

interface EmailWizardProps {
  years: string[]
  selectedYear: string
  previousYear: string
  targetCourses: { id: string; title: string }[]
  initialTree: GroupTree
  /** Full PREPORUKA option set (encoded values + labels) — the report-card dropdown feed. */
  recommendationOptions: RecommendationOption[]
}

const DEFAULT_INVITATION_BODY = [
  'Poštovani,',
  'Vaše je dijete prošle školske godine pohađalo program LEGO robotike u našoj udruzi i nadamo se da ćemo se družiti i ove godine.',
  'Upisi u novu školsku godinu su otvoreni. U nastavku se nalaze termini grupa — prijavu ispunite putem poveznice na dnu ove poruke, a mi ćemo vam se javiti s potvrdom termina.',
  'Broj mjesta po grupi je ograničen, stoga preporučujemo što raniju prijavu.',
].join('\n')

const DEFAULT_EVALUATION_BODY = [
  'Poštovani,',
  'U nastavku se nalazi evaluacija Vašeg djeteta po završetku programa. Opisuje napredak kroz praktične i timske vještine te preporuku mentora za nastavak.',
  'Evaluacija je uvijek dostupna u polazničkom portalu. Za sva pitanja slobodno nam odgovorite na ovu poruku.',
].join('\n')

const SELECT_CLASS =
  'w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
const SECONDARY_BUTTON =
  'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const PRIMARY_BUTTON =
  'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export function EmailWizard({
  years,
  selectedYear,
  previousYear,
  targetCourses,
  initialTree,
  recommendationOptions,
}: Readonly<EmailWizardProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [step, setStep] = useState<1 | 2>(1)
  const [kind, setKind] = useState<Kind>('CUSTOM')

  // Step 1 — content
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [targetCourseId, setTargetCourseId] = useState('')
  const [targetGroups, setTargetGroups] = useState<TargetGroup[]>([])
  const [targetGroupIds, setTargetGroupIds] = useState<string[]>([])
  const [loadingTargetGroups, setLoadingTargetGroups] = useState(false)
  /** Distinguishes "the fetch failed" from "this program genuinely has no groups". */
  const [targetGroupsError, setTargetGroupsError] = useState(false)

  // Step 2 — recipients
  const [sourceYear, setSourceYear] = useState(selectedYear)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('GROUPS')
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [tree, setTree] = useState<GroupTree>(initialTree)
  const [loadingTree, setLoadingTree] = useState(false)
  const [sourceGroupIds, setSourceGroupIds] = useState<string[]>([])
  const [recipientData, setRecipientData] = useState<RecipientData | null>(null)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Send + preview
  const [confirming, setConfirming] = useState(false)
  const [sendResult, setSendResult] = useState<SendSuccess | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const applyKind = (next: Kind) => {
    if (next === kind) return
    setKind(next)
    setSendResult(null)
    setConfirming(false)
    setSourceGroupIds([])
    setRecommendations([])
    setRecipientData(null)
    setExcluded(new Set())
    setSearch('')
    setTargetCourseId('')
    setTargetGroups([])
    setTargetGroupIds([])
    // An evaluation is always about a year already taught, so it never uses the
    // preporuka cohort (the server rejects it too).
    if (next === 'EVALUATION') setSelectionMode('GROUPS')
    if (next === 'REENROLLMENT') {
      setSubject(`Upisi u školsku godinu ${selectedYear} – Inovatic`)
      setBodyText(DEFAULT_INVITATION_BODY)
      setSourceYear(previousYear)
    } else if (next === 'EVALUATION') {
      // No child name here — the send appends it per recipient.
      setSubject('Evaluacija po završetku programa – Inovatic')
      setBodyText(DEFAULT_EVALUATION_BODY)
      setSourceYear(selectedYear)
    } else {
      setSubject('')
      setBodyText('')
      setSourceYear(selectedYear)
    }
  }

  // Reload the group tree when the source year or kind changes (the initial
  // CUSTOM + selected-year tree comes preloaded from the server).
  const treeKeyRef = useRef(`${selectedYear}:false`)
  useEffect(() => {
    // Radionice are never graded and are not a re-enrolment cohort either.
    const excludeRadionice = kind !== 'CUSTOM'
    const key = `${sourceYear}:${excludeRadionice}`
    if (treeKeyRef.current === key) return
    treeKeyRef.current = key
    let cancelled = false
    setLoadingTree(true)
    setTree([])
    getEmailGroupTree(sourceYear, excludeRadionice)
      .then((next) => {
        if (!cancelled) setTree(next)
      })
      .catch(() => {
        if (!cancelled) toast.error('Greška pri učitavanju grupa.')
      })
      .finally(() => {
        if (!cancelled) setLoadingTree(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, sourceYear])

  // Live recipient resolution; the request id drops stale responses.
  const requestIdRef = useRef(0)
  const hasSelection =
    selectionMode === 'GROUPS' ? sourceGroupIds.length > 0 : recommendations.length > 0
  useEffect(() => {
    if (!hasSelection) {
      setRecipientData(null)
      return
    }
    const id = ++requestIdRef.current
    setLoadingRecipients(true)
    previewEmailRecipients({
      kind,
      sourceSchoolYear: sourceYear,
      sourceGroupIds: selectionMode === 'GROUPS' ? sourceGroupIds : undefined,
      recommendations: selectionMode === 'RECOMMENDATION' ? recommendations : undefined,
      targetCourseId: kind === 'REENROLLMENT' && targetCourseId ? targetCourseId : undefined,
    })
      .then((res) => {
        if (requestIdRef.current !== id) return
        if (res.success) {
          setRecipientData(res)
        } else {
          setRecipientData(null)
          toast.error(res.error)
        }
      })
      .catch(() => {
        // Never keep a stale list on a failed refresh (e.g. a dev-time HMR 404).
        if (requestIdRef.current !== id) return
        setRecipientData(null)
        toast.error('Greška pri dohvaćanju primatelja.')
      })
      .finally(() => {
        if (requestIdRef.current === id) setLoadingRecipients(false)
      })
  }, [kind, sourceYear, sourceGroupIds, recommendations, selectionMode, hasSelection, targetCourseId])

  const handleSourceYearChange = (year: string) => {
    setSourceYear(year)
    setSourceGroupIds([])
    setRecipientData(null)
    setExcluded(new Set())
    setConfirming(false)
  }

  const applySelectionMode = (mode: SelectionMode) => {
    if (mode === selectionMode) return
    setSelectionMode(mode)
    setSourceGroupIds([])
    setRecommendations([])
    setRecipientData(null)
    setExcluded(new Set())
    setConfirming(false)
  }

  const toggleRecommendation = (value: string) => {
    setRecommendations((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
    setConfirming(false)
  }

  const toggleSourceGroup = (id: string) => {
    setSourceGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
    setConfirming(false)
  }

  const toggleSourceCourse = (courseId: string) => {
    const course = tree.find((c) => c.id === courseId)
    if (!course) return
    const ids = course.scheduledGroups.map((g) => g.id)
    const allSelected = ids.every((id) => sourceGroupIds.includes(id))
    setSourceGroupIds((prev) =>
      allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    )
    setConfirming(false)
  }

  const allTreeGroupIds = useMemo(
    () => tree.flatMap((c) => c.scheduledGroups.map((g) => g.id)),
    [tree],
  )
  /**
   * "Every group" is submitted as real ids rather than as a server-side flag, so
   * the campaign's audit snapshot stays a complete list and the existence check
   * (city + year + kind) applies to each one exactly as it does to a hand-picked
   * selection.
   */
  const allGroupsSelected =
    allTreeGroupIds.length > 0 && allTreeGroupIds.every((id) => sourceGroupIds.includes(id))
  const toggleAllGroups = () => {
    setSourceGroupIds(allGroupsSelected ? [] : allTreeGroupIds)
    setConfirming(false)
  }

  const handleTargetCourseChange = async (courseId: string) => {
    setTargetCourseId(courseId)
    setTargetGroupIds([])
    setTargetGroups([])
    setTargetGroupsError(false)
    if (!courseId) return
    setLoadingTargetGroups(true)
    try {
      const groups = await getGroupsForCourse(courseId)
      setTargetGroups(
        groups.map((sg) => ({
          id: sg.id,
          label: [
            sg.name,
            formatGroupSchedule({
              dateRange: isRadionica(sg.course.kind),
              dayOfWeek: sg.dayOfWeek,
              dateStart: sg.dateStart,
              dateEnd: sg.dateEnd,
              startTime: sg.startTime,
              endTime: sg.endTime,
            }) || null,
            sg.location.name,
          ]
            .filter(Boolean)
            .join(' · '),
          availableSpots: sg.availableSpots,
          isFull: sg.isFull,
        })),
      )
    } catch {
      // Without this the empty list rendered as "Nema grupa za ovaj program" —
      // an assertion about the data when the request merely failed, and the
      // admin would drop a termin from the invitation believing it did not exist.
      setTargetGroupsError(true)
      toast.error('Greška pri učitavanju grupa.')
    } finally {
      setLoadingTargetGroups(false)
    }
  }

  const toggleTargetGroup = (id: string) => {
    setTargetGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const alreadySentSet = useMemo(
    () => new Set(recipientData?.alreadySent ?? []),
    [recipientData],
  )
  const recipients = useMemo(() => recipientData?.recipients ?? [], [recipientData])
  const skipped = recipientData?.skipped ?? []
  const checkedCount = recipients.filter(
    (r) => !excluded.has(r.rowKey) && !alreadySentSet.has(r.parentEmail),
  ).length

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipients
    return recipients.filter(
      (r) =>
        r.parentEmail.includes(q) ||
        r.children.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.groupLabel ?? '').toLowerCase().includes(q),
        ),
    )
  }, [recipients, search])

  /**
   * Keyed on `rowKey`, not on the e-mail address: an evaluation row is one child,
   * so siblings share an address and excluding by address would silently drop the
   * sibling of every child the admin unchecked.
   */
  const toggleRecipient = (rowKey: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })
    setConfirming(false)
  }

  const [rowPreviewKey, setRowPreviewKey] = useState<string | null>(null)
  /** Names the child and inbox being previewed — the whole point of a row preview. */
  const rowPreviewDescription = useMemo(() => {
    if (!rowPreviewKey) return undefined
    const row = recipients.find((r) => r.rowKey === rowPreviewKey)
    if (!row) return undefined
    return `Poruka za ${row.parentEmail} — sadrži isključivo evaluaciju za ${row.children
      .map((c) => c.name)
      .join(', ')}.`
  }, [rowPreviewKey, recipients])

  /** "Show me exactly what this parent gets" — runs the real send-path guard. */
  const handleRowPreview = (rowKey: string) => {
    setPreviewHtml(null)
    setPreviewOpen(true)
    setRowPreviewKey(rowKey)
    previewEvaluationEmailForRecipient({
      kind: 'EVALUATION',
      subject,
      bodyText,
      sourceSchoolYear: sourceYear,
      sourceGroupIds,
      assessmentId: rowKey,
    })
      .then((res) => {
        if (res.success) {
          setPreviewHtml(res.html)
        } else {
          setPreviewOpen(false)
          toast.error(res.error)
        }
      })
      .catch(() => {
        setPreviewOpen(false)
        toast.error('Greška pri izradi pregleda.')
      })
  }

  const contentValid =
    subject.trim().length >= 3 &&
    bodyText.trim().length >= 10 &&
    (kind !== 'REENROLLMENT' || (targetCourseId !== '' && targetGroupIds.length > 0))

  const handlePreview = () => {
    if (!contentValid) {
      toast.error(
        kind === 'REENROLLMENT'
          ? 'Ispunite predmet i tekst te odaberite ciljni program i grupe.'
          : 'Ispunite predmet i tekst poruke.',
      )
      return
    }
    setPreviewHtml(null)
    setPreviewOpen(true)
    setRowPreviewKey(null)
    let input
    if (kind === 'REENROLLMENT') {
      input = { kind: 'REENROLLMENT' as const, subject, bodyText, targetCourseId, targetGroupIds }
    } else if (kind === 'EVALUATION') {
      input = { kind: 'EVALUATION' as const, subject, bodyText }
    } else {
      input = { kind: 'CUSTOM' as const, subject, bodyText }
    }
    previewEmailHtml(input)
      .then((res) => {
        if (res.success) {
          setPreviewHtml(res.html)
        } else {
          setPreviewOpen(false)
          toast.error(res.error)
        }
      })
      .catch(() => {
        setPreviewOpen(false)
        toast.error('Greška pri izradi pregleda.')
      })
  }

  const handleSend = () => {
    if (checkedCount === 0) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const base = {
        sourceSchoolYear: sourceYear,
        sourceGroupIds: selectionMode === 'GROUPS' ? sourceGroupIds : undefined,
        recommendations: selectionMode === 'RECOMMENDATION' ? recommendations : undefined,
        subject,
        bodyText,
      }
      let input
      if (kind === 'REENROLLMENT') {
        input = {
          kind: 'REENROLLMENT' as const,
          ...base,
          targetCourseId,
          targetGroupIds,
          excludedParentEmails: [...excluded],
        }
      } else if (kind === 'EVALUATION') {
        // Excluded rows are report cards here, not inboxes — see toggleRecipient.
        input = { kind: 'EVALUATION' as const, ...base, excludedAssessmentIds: [...excluded] }
      } else {
        input = { kind: 'CUSTOM' as const, ...base, excludedParentEmails: [...excluded] }
      }
      try {
        const res = await sendEmailCampaign(input)
        setConfirming(false)
        if (res.success) {
          setSendResult(res)
          // The send continues on the server, so the admin may close the tab.
          toast.success(`Slanje pokrenuto — ${res.total} primatelja.`)
          router.refresh()
        } else {
          toast.error(res.error)
        }
      } catch {
        setConfirming(false)
        toast.error('Greška pri slanju — pokušajte ponovno.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Step header */}
      <div className="flex items-center gap-2 text-sm">
        {([1, 2] as const).map((s) => (
          <button
            key={s}
            type="button"
            // Disabled, not a silent no-op: keyboard and screen-reader users
            // must be told the step is unavailable until the content is valid.
            disabled={s === 2 && !contentValid}
            onClick={() => setStep(s)}
            className={[
              'px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              step === s
                ? 'bg-cyan-600 border-cyan-600 text-white'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
            ].join(' ')}
          >
            {s}. {s === 1 ? 'Sadržaj' : 'Primatelji'}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Vrsta poruke</h2>
            <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-1">
              {EMAIL_CAMPAIGN_KIND_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyKind(value)}
                  className={[
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    kind === value
                      ? 'bg-white shadow-sm text-gray-900 font-medium'
                      : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  {EMAIL_CAMPAIGN_KINDS[value].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {EMAIL_CAMPAIGN_KINDS[kind].description}
            </p>
            {kind === 'EVALUATION' && (
              <p className="mt-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                Jedno dijete = jedan e-mail. Braća i sestre na istoj adresi dobivaju dvije
                odvojene poruke, svaka samo sa svojom karticom — nijedan roditelj ne može
                primiti evaluaciju tuđeg djeteta.
              </p>
            )}
          </section>

          {kind === 'REENROLLMENT' && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">
                Cilj — termini u {selectedYear}
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Odaberite program i grupe čiji će termini biti prikazani u pozivnici.
              </p>
              <select
                value={targetCourseId}
                onChange={(e) => handleTargetCourseChange(e.target.value)}
                className={SELECT_CLASS}
                aria-label="Ciljni program"
              >
                <option value="">– Odaberite program –</option>
                {targetCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <div className="space-y-2 max-h-64 overflow-y-auto mt-3">
                {loadingTargetGroups && (
                  <p className="text-sm text-gray-400 italic py-3 text-center">Učitavam grupe...</p>
                )}
                {!loadingTargetGroups && targetGroupsError && (
                  <p className="text-sm text-red-600 py-3 text-center">
                    Greška pri učitavanju — pokušajte ponovno.
                  </p>
                )}
                {!loadingTargetGroups &&
                  !targetGroupsError &&
                  targetCourseId !== '' &&
                  targetGroups.length === 0 && (
                    <p className="text-sm text-gray-400 italic py-3 text-center">
                      Nema grupa za ovaj program u {selectedYear}.
                    </p>
                  )}
                {!loadingTargetGroups &&
                  targetGroups.map((g) => {
                    const checked = targetGroupIds.includes(g.id)
                    return (
                      <label
                        key={g.id}
                        className={[
                          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          checked
                            ? 'bg-cyan-50 border-cyan-300'
                            : 'bg-white border-gray-200 hover:border-gray-300',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTargetGroup(g.id)}
                          className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        <span className="flex-1 text-sm text-gray-800">{g.label}</span>
                        <GroupCapacityChip availableSpots={g.availableSpots} isFull={g.isFull} />
                      </label>
                    )
                  })}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Poruka</h2>
            <div>
              <label htmlFor="email-subject" className="block text-sm font-medium text-gray-700 mb-1.5">
                Predmet <span className="text-red-600">*</span>
              </label>
              <input
                id="email-subject"
                type="text"
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Predmet e-maila"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="email-body" className="block text-sm font-medium text-gray-700 mb-1.5">
                Tekst poruke <span className="text-red-600">*</span>
              </label>
              <textarea
                id="email-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                maxLength={5000}
                rows={10}
                placeholder="Tekst koji će roditelji primiti. Prazan red započinje novi odlomak."
                className={`${INPUT_CLASS} resize-y`}
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Poruka se šalje točno kako je napisana — uključite i pozdrav po želji
                {kind === 'REENROLLMENT' &&
                  '; ispod teksta automatski slijede termini odabranih grupa i gumb za prijavu'}
                {kind === 'EVALUATION' &&
                  '; ispod teksta automatski slijedi kartica djeteta, a njegovo se ime dodaje u predmet poruke'}
                . <span className="text-gray-400">{bodyText.trim().length}/5000</span>
              </p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={handlePreview} className={SECONDARY_BUTTON}>
                <span className="inline-flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Pregled e-maila
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!contentValid}
                className={PRIMARY_BUTTON}
              >
                Dalje: primatelji
              </button>
            </div>
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Primatelji</h2>
            <p className="text-xs text-gray-500 mb-3">
              {(() => {
                if (kind === 'REENROLLMENT') {
                  return 'Roditelji polaznika standardnih programa iz odabrane (prošle) godine.'
                }
                if (kind === 'EVALUATION') {
                  return 'Jedan red = jedno dijete i njegova kartica. Radionice se ne ocjenjuju pa nisu na popisu.'
                }
                return 'Roditelji polaznika odabranih grupa iz odabrane školske godine.'
              })()}
            </p>
            <div className="max-w-xs">
              <label htmlFor="source-year" className="block text-sm font-medium text-gray-700 mb-1.5">
                Školska godina
              </label>
              <select
                id="source-year"
                value={sourceYear}
                onChange={(e) => handleSourceYearChange(e.target.value)}
                className={SELECT_CLASS}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                    {y === selectedYear ? ' (odabrana)' : ''}
                    {y === previousYear ? ' (prošla)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* An evaluation is always a group's own report cards, so there is no
                mode to pick — a preporuka cohort names children, not cards. */}
            {kind !== 'EVALUATION' && (
              <div className="mt-4">
                <span className="block text-sm font-medium text-gray-700 mb-1.5">
                  Način odabira
                </span>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                  {(
                    [
                      { value: 'GROUPS', label: 'Po grupama' },
                      { value: 'RECOMMENDATION', label: 'Po preporuci' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => applySelectionMode(option.value)}
                      className={[
                        'px-3 py-1.5 text-sm rounded-md transition-colors',
                        selectionMode === option.value
                          ? 'bg-white shadow-sm text-gray-900 font-medium'
                          : 'text-gray-500 hover:text-gray-700',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectionMode === 'RECOMMENDATION' && (
              <div className="mt-4 space-y-1 rounded-lg border border-gray-100 p-3">
                {recommendationOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-2.5 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recommendations.includes(option.value)}
                      onChange={() => toggleRecommendation(option.value)}
                      className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-gray-800">{option.label}</span>
                  </label>
                ))}
                <p className="text-xs text-gray-500 pt-1">
                  Svi polaznici odabrane godine s odabranom preporukom u izvještaju — neovisno o
                  grupi i programu.
                </p>
              </div>
            )}

            {selectionMode === 'GROUPS' && !loadingTree && tree.length > 0 && (
              <label className="mt-4 flex w-fit cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allGroupsSelected}
                  onChange={toggleAllGroups}
                  className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-sm font-medium text-gray-800">
                  {'Odaberi sve grupe'}
                  <span className="ml-1.5 font-normal text-gray-500">
                    ({allTreeGroupIds.length} u {sourceYear})
                  </span>
                </span>
              </label>
            )}

            {selectionMode === 'GROUPS' && (
            <div className="mt-3 space-y-3 max-h-96 overflow-y-auto rounded-lg border border-gray-100 p-3">
              {loadingTree && (
                <p className="text-sm text-gray-400 italic py-3 text-center">Učitavam grupe...</p>
              )}
              {!loadingTree && tree.length === 0 && (
                <p className="text-sm text-gray-400 italic py-3 text-center">
                  Nema grupa u {sourceYear}.
                </p>
              )}
              {!loadingTree &&
                tree.map((course) => {
                  const groupIds = course.scheduledGroups.map((g) => g.id)
                  const selectedInCourse = groupIds.filter((id) => sourceGroupIds.includes(id))
                  const allSelected = selectedInCourse.length === groupIds.length && groupIds.length > 0
                  const someSelected = selectedInCourse.length > 0 && !allSelected
                  return (
                    <div key={course.id}>
                      <label className="flex items-center gap-2.5 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected
                          }}
                          onChange={() => toggleSourceCourse(course.id)}
                          className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        <span className="text-sm font-medium text-gray-900">{course.title}</span>
                        {isRadionica(course.kind) && (
                          <span className="text-[10px] font-medium rounded px-1.5 py-0.5 border bg-amber-50 text-amber-700 border-amber-200">
                            Radionica
                          </span>
                        )}
                      </label>
                      <div className="ml-6 space-y-1">
                        {course.scheduledGroups.map((g) => {
                          const checked = sourceGroupIds.includes(g.id)
                          const label = [
                            g.name,
                            formatGroupSchedule({
                              dateRange: isRadionica(course.kind),
                              dayOfWeek: g.dayOfWeek,
                              dateStart: g.dateStart,
                              dateEnd: g.dateEnd,
                              startTime: g.startTime,
                              endTime: g.endTime,
                            }) || null,
                            g.location.name,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                          return (
                            <label
                              key={g.id}
                              className="flex items-center gap-2.5 py-0.5 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSourceGroup(g.id)}
                                className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                              />
                              <span className="flex-1 text-sm text-gray-700">{label}</span>
                              {kind === 'EVALUATION' ? (
                                // The number that decides whether this group is
                                // ready to send: ungraded kids are skipped, so an
                                // incomplete group needs grading first.
                                <span
                                  className={[
                                    'text-[10px] whitespace-nowrap rounded px-1.5 py-0.5 border',
                                    g.gradedCount === g._count.enrollments
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200',
                                  ].join(' ')}
                                  title="Polaznici s ispunjenom evaluacijom / ukupno u grupi"
                                >
                                  {g.gradedCount}/{g._count.enrollments} ocijenjeno
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                  {g._count.enrollments}{' '}
                                  {g._count.enrollments === 1 ? 'učenik' : 'učenika'}
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
            </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Popis primatelja
                {recipientData && (
                  <span className="ml-2 text-cyan-700">
                    {checkedCount} {checkedCount === 1 ? 'odabran' : 'odabrano'}
                  </span>
                )}
                {loadingRecipients && (
                  <span className="ml-2 text-gray-400 font-normal">učitavam...</span>
                )}
              </h2>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Traži po imenu djeteta ili e-mailu"
                className={`${INPUT_CLASS} max-w-xs`}
                aria-label="Pretraga primatelja"
              />
            </div>

            {!hasSelection && (
              <p className="text-sm text-gray-400 italic py-4 text-center">
                {selectionMode === 'GROUPS'
                  ? 'Odaberite grupe iznad da biste vidjeli primatelje.'
                  : 'Odaberite preporuku iznad da biste vidjeli primatelje.'}
              </p>
            )}

            {kind === 'EVALUATION' && recipients.length > 0 && (
              <p className="mb-3 text-xs text-gray-500">
                Ukupno {checkedCount} {croatianPlural(checkedCount, 'poruka', 'poruke', 'poruka')} —
                po jedna za svako dijete. Kliknite <strong>Pregled</strong> na bilo kojem redu
                da vidite točno onaj e-mail koji taj roditelj prima.
              </p>
            )}

            {hasSelection && recipientData && (
              <>
                {filteredRecipients.length === 0 && (
                  <p className="text-sm text-gray-400 italic py-4 text-center">
                    {search ? 'Nema rezultata pretrage.' : 'Nema primatelja za odabrani izvor.'}
                  </p>
                )}
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {filteredRecipients.map((r) => {
                    const wasSent = alreadySentSet.has(r.parentEmail)
                    const checked = !wasSent && !excluded.has(r.rowKey)
                    const incomplete =
                      kind === 'EVALUATION' && r.children.some((c) => c.complete === false)
                    return (
                      <div
                        key={r.rowKey}
                        className={[
                          'flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors',
                          wasSent ? 'bg-gray-50 border-gray-100 opacity-70' : '',
                          !wasSent && checked
                            ? 'bg-white border-gray-200 hover:border-gray-300'
                            : '',
                          !wasSent && !checked ? 'bg-gray-50 border-gray-200' : '',
                        ].join(' ')}
                      >
                        <label
                          aria-label={`Primatelj ${r.parentEmail}`}
                          className="flex flex-1 items-center gap-3 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={wasSent || isPending}
                            onChange={() => toggleRecipient(r.rowKey)}
                            className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                          />
                          <span className="flex-1 text-sm">
                            <span
                              className={checked ? 'text-gray-800' : 'text-gray-400 line-through'}
                            >
                              {r.children.map((c, i) => (
                                <span key={`${r.rowKey}-${i}`}>
                                  {i > 0 && ', '}
                                  {c.name}
                                  {c.groupLabel && (
                                    <span className="text-gray-400"> · {c.groupLabel}</span>
                                  )}
                                  {c.recommendation && (
                                    <span
                                      className="ml-1.5 inline-block align-middle text-[10px] font-medium rounded px-1.5 py-0.5 border bg-violet-50 text-violet-700 border-violet-200 whitespace-nowrap"
                                      title={`Preporuka iz prošle godine: ${c.recommendation}`}
                                    >
                                      Preporuka: {c.recommendation}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </span>
                            <span className="text-gray-400"> — {r.parentEmail}</span>
                          </span>
                        </label>
                        {incomplete && (
                          <span
                            className="text-[10px] font-medium rounded px-1.5 py-0.5 border bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap"
                            title="Neke vještine u rubrici nisu ocijenjene — kartica će se poslati s oznakom „Nije ocijenjeno”."
                          >
                            nepotpuna
                          </span>
                        )}
                        {kind === 'EVALUATION' && (
                          <button
                            type="button"
                            onClick={() => handleRowPreview(r.rowKey)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-gray-300 hover:text-gray-800"
                            title="Prikaži točno onaj e-mail koji ovaj roditelj prima"
                          >
                            <Eye className="h-3 w-3" />
                            Pregled
                          </button>
                        )}
                        {wasSent && (
                          <span className="text-[10px] font-medium rounded px-1.5 py-0.5 border bg-gray-100 text-gray-500 border-gray-200 whitespace-nowrap">
                            već poslano
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {skipped.length > 0 && (
                  <details className="mt-3 text-sm" open={kind === 'EVALUATION'}>
                    <summary className="cursor-pointer text-amber-700">
                      Preskočeno: {skipped.length}{' '}
                      {kind === 'EVALUATION'
                        ? '(bez evaluacije ili bez valjane e-mail adrese)'
                        : '(bez valjane e-mail adrese)'}
                    </summary>
                    {kind === 'EVALUATION' && (
                      <p className="mt-1.5 ml-4 text-xs text-gray-500">
                        Ova djeca neće primiti ništa. Ispunite im evaluaciju (ili e-mail
                        roditelja) i ponovno pokrenite slanje — već poslane poruke se ne
                        ponavljaju jer se šalju samo odabrani redovi.
                      </p>
                    )}
                    <ul className="mt-2 ml-4 list-disc text-gray-600 space-y-0.5">
                      {skipped.map((s) => (
                        <li key={`${s.studentId}-${s.reason}`}>
                          {s.studentName}{' '}
                          <span className="text-gray-400">({SKIP_REASON_SHORT[s.reason]})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setStep(1)
                  setConfirming(false)
                }}
                disabled={isPending}
                className={SECONDARY_BUTTON}
              >
                Natrag: sadržaj
              </button>
              <div className="flex items-center gap-2">
                {confirming && (
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isPending}
                    className={SECONDARY_BUTTON}
                  >
                    Odustani
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending || checkedCount === 0}
                  className={
                    confirming
                      ? 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50'
                      : PRIMARY_BUTTON
                  }
                >
                  <Send className="w-4 h-4" />
                  {(() => {
                    if (isPending) return 'Šaljem...'
                    if (confirming) return `Potvrdi slanje (${checkedCount})`
                    return `Pošalji (${checkedCount})`
                  })()}
                </button>
              </div>
            </div>

            {sendResult && <SendProgressPanel result={sendResult} />}
          </section>
        </div>
      )}

      <EmailPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        html={previewHtml}
        description={rowPreviewDescription}
      />
    </div>
  )
}
