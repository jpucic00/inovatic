'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, Send } from 'lucide-react'
import { formatGroupSchedule } from '@/lib/format'
import type { RecommendationOption } from '@/lib/assessment-rubric'
import { GroupCapacityChip } from '@/components/admin/group-capacity-chip'
import { getGroupsForCourse } from '@/actions/admin/inquiry'
import {
  getEmailGroupTree,
  previewEmailHtml,
  previewEmailRecipients,
  sendEmailCampaign,
  type PreviewRecipientsResult,
  type SendEmailCampaignResult,
} from '@/actions/admin/email-campaign'
import { EmailPreviewDialog } from './email-preview-dialog'

type Kind = 'CUSTOM' | 'REENROLLMENT'
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
    if (next === 'REENROLLMENT') {
      setSubject(`Upisi u školsku godinu ${selectedYear} – Inovatic`)
      setBodyText(DEFAULT_INVITATION_BODY)
      setSourceYear(previousYear)
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
    const standardOnly = kind === 'REENROLLMENT'
    const key = `${sourceYear}:${standardOnly}`
    if (treeKeyRef.current === key) return
    treeKeyRef.current = key
    let cancelled = false
    setLoadingTree(true)
    setTree([])
    getEmailGroupTree(sourceYear, standardOnly)
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

  const handleTargetCourseChange = async (courseId: string) => {
    setTargetCourseId(courseId)
    setTargetGroupIds([])
    setTargetGroups([])
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
              isCustom: sg.course.isCustom,
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
    (r) => !excluded.has(r.parentEmail) && !alreadySentSet.has(r.parentEmail),
  ).length

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipients
    return recipients.filter(
      (r) =>
        r.parentEmail.includes(q) ||
        r.children.some((c) => c.name.toLowerCase().includes(q)),
    )
  }, [recipients, search])

  const toggleRecipient = (email: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
    setConfirming(false)
  }

  const contentValid =
    subject.trim().length >= 3 &&
    bodyText.trim().length >= 10 &&
    (kind === 'CUSTOM' || (targetCourseId !== '' && targetGroupIds.length > 0))

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
    const input =
      kind === 'CUSTOM'
        ? { kind: 'CUSTOM' as const, subject, bodyText }
        : { kind: 'REENROLLMENT' as const, subject, bodyText, targetCourseId, targetGroupIds }
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
        excludedParentEmails: [...excluded],
      }
      const input =
        kind === 'CUSTOM'
          ? { kind: 'CUSTOM' as const, ...base }
          : { kind: 'REENROLLMENT' as const, ...base, targetCourseId, targetGroupIds }
      try {
        const res = await sendEmailCampaign(input)
        setConfirming(false)
        if (res.success) {
          setSendResult(res)
          toast.success(`Poslano ${res.sent} poruka.`)
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
            onClick={() => {
              if (s === 2 && !contentValid) return
              setStep(s)
            }}
            className={[
              'px-3 py-1.5 rounded-full border transition-colors',
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
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  { value: 'CUSTOM', label: 'Prilagođena poruka' },
                  { value: 'REENROLLMENT', label: 'Pozivnica za ponovni upis' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyKind(option.value)}
                  className={[
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    kind === option.value
                      ? 'bg-white shadow-sm text-gray-900 font-medium'
                      : 'text-gray-500 hover:text-gray-700',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {kind === 'CUSTOM'
                ? 'Slobodna poruka u standardnom Inovatic predlošku (logo i podnožje dodaju se automatski).'
                : `Pozivnica prošlogodišnjim polaznicima s terminima grupa za ${selectedYear} i poveznicom na prijavnicu.`}
            </p>
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
                {!loadingTargetGroups && targetCourseId !== '' && targetGroups.length === 0 && (
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
              {kind === 'REENROLLMENT'
                ? 'Roditelji polaznika standardnih programa iz odabrane (prošle) godine.'
                : 'Roditelji polaznika odabranih grupa iz odabrane školske godine.'}
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

            {selectionMode === 'GROUPS' && (
            <div className="mt-4 space-y-3 max-h-96 overflow-y-auto rounded-lg border border-gray-100 p-3">
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
                        {course.isCustom && (
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
                              isCustom: course.isCustom,
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
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                {g._count.enrollments}{' '}
                                {g._count.enrollments === 1 ? 'učenik' : 'učenika'}
                              </span>
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
                    const checked = !wasSent && !excluded.has(r.parentEmail)
                    return (
                      <label
                        key={r.parentEmail}
                        className={[
                          'flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors',
                          wasSent
                            ? 'bg-gray-50 border-gray-100 cursor-not-allowed opacity-70'
                            : 'cursor-pointer',
                          !wasSent && checked
                            ? 'bg-white border-gray-200 hover:border-gray-300'
                            : '',
                          !wasSent && !checked ? 'bg-gray-50 border-gray-200' : '',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={wasSent || isPending}
                          onChange={() => toggleRecipient(r.parentEmail)}
                          className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        <span className="flex-1 text-sm">
                          <span className={checked ? 'text-gray-800' : 'text-gray-400 line-through'}>
                            {r.children.map((c, i) => (
                              <span key={`${r.parentEmail}-${i}`}>
                                {i > 0 && ', '}
                                {c.name}
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
                        {wasSent && (
                          <span className="text-[10px] font-medium rounded px-1.5 py-0.5 border bg-gray-100 text-gray-500 border-gray-200 whitespace-nowrap">
                            već poslano
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>

                {skipped.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-amber-700">
                      Preskočeno: {skipped.length} (bez valjane e-mail adrese)
                    </summary>
                    <ul className="mt-2 ml-4 list-disc text-gray-600 space-y-0.5">
                      {skipped.map((s) => (
                        <li key={s.studentId}>
                          {s.studentName}{' '}
                          <span className="text-gray-400">
                            ({s.reason === 'MISSING_EMAIL' ? 'nema e-mail' : 'neispravan e-mail'})
                          </span>
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

            {sendResult && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-gray-800">
                <p className="font-medium mb-1">Kampanja poslana</p>
                <p>
                  Poslano: {sendResult.sent} · Već poslano ranije: {sendResult.alreadySent} ·
                  Isključeno: {sendResult.excluded} · Neuspješno: {sendResult.failed.length} ·
                  Preskočeno (bez e-maila): {sendResult.skipped.length}
                </p>
                {sendResult.failed.length > 0 && (
                  <p className="mt-1 text-red-700">
                    Neuspješno poslano: {sendResult.failed.join(', ')}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      <EmailPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} html={previewHtml} />
    </div>
  )
}
