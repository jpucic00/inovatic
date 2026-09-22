'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, UserRoundPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  assignTeacherToGroup,
  unassignTeacherFromGroup,
} from '@/actions/admin/teacher'
import {
  addSessionStaffChange,
  removeSessionStaffChange,
  setTeacherAssignmentRole,
  type GroupStaffChangeRow,
} from '@/actions/admin/session-staff'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog, type ConfirmRequest } from '@/components/shared/confirm-dialog'
import { RoleBadge, RoleSelect } from '@/components/admin/groups/staff-role'
import { formatDateKey } from '@/lib/format'
import {
  compareStaff,
  staffChangeLabel,
  type StaffRole,
  type TerminSection,
} from '@/lib/session-staff'
import { cn } from '@/lib/utils'

type Person = { id: string; firstName: string; lastName: string; email: string }

type Assignment = {
  id: string
  role: StaffRole
  user: Person
}

interface Props {
  groupId: string
  assignments: Assignment[]
  /** Own-city staff not yet on the group — the "Dodaj nastavnika" choices. */
  assignableTeachers: Person[]
  /** Every own-city teacher or admin — who can be put on a termin. */
  people: Person[]
  /** Changes on termini that are not over yet (today or later, Zagreb). */
  changes: GroupStaffChangeRow[]
  /** The group's upcoming termini, grouped like the Dolazak tab. */
  terminSections: TerminSection[]
  editable: boolean
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`

const BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors'
const SELECT =
  'w-full px-3 py-2 text-sm rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent'
const LABEL = 'block text-xs font-medium text-gray-600 mb-1'

/**
 * The group's staff as one list: the regular predavači and asistenti, then
 * anyone an admin put on specific termini. A substitute stays on the list only
 * while one of their termini is still ahead — the same window in which they can
 * open the group — so the list always says who is actually teaching here.
 */
export function GroupTeachersPanel({
  groupId,
  assignments,
  assignableTeachers,
  people,
  changes,
  terminSections,
  editable,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [teacherOpen, setTeacherOpen] = useState(false)
  const [substituteOpen, setSubstituteOpen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)

  const run = (action: () => Promise<{ success: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await action()
      if (res.success) {
        toast.success(ok)
        router.refresh()
      } else {
        toast.error(res.error ?? 'Greška.')
      }
    })

  const regulars = [...assignments].sort((a, b) =>
    compareStaff({ role: a.role, name: fullName(a.user) }, { role: b.role, name: fullName(b.user) }),
  )
  const regularIds = new Set(assignments.map((a) => a.user.id))
  const substitutes = groupChanges(changes)
  // Termini each regular hands over, shown on their own row.
  const replacedOn = new Map<string, string[]>()
  for (const c of changes) {
    if (!c.replacesUserId) continue
    replacedOn.set(c.replacesUserId, [...(replacedOn.get(c.replacesUserId) ?? []), c.sessionDate])
  }

  const askRemoveChange = (c: GroupStaffChangeRow) =>
    setConfirmRequest({
      title: 'Ukloniti zamjenu za termin?',
      description: `${c.name} više neće biti na terminu ${formatDateKey(c.sessionDate)}.${
        c.replacesName ? ` ${c.replacesName} ponovno drži taj termin.` : ''
      } Već evidentirani sati ostaju.`,
      confirmLabel: 'Ukloni',
      destructive: true,
      onConfirm: () => run(() => removeSessionStaffChange(c.id), 'Zamjena uklonjena.'),
    })

  const empty = regulars.length === 0 && substitutes.length === 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Nastavnici</h2>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTeacherOpen(true)}
              disabled={assignableTeachers.length === 0}
              className={cn(BUTTON, 'disabled:opacity-50')}
            >
              <Plus className="w-3.5 h-3.5" />
              Dodaj nastavnika
            </button>
            <button onClick={() => setSubstituteOpen(true)} className={BUTTON}>
              <UserRoundPlus className="w-3.5 h-3.5" />
              Dodaj zamjenu
            </button>
          </div>
        )}
      </div>

      {empty ? (
        <p className="text-sm text-gray-400 italic">Nema dodijeljenih nastavnika.</p>
      ) : (
        <div className="space-y-2">
          {regulars.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <Link
                    href={`/admin/nastavnici/${a.user.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-cyan-700 transition-colors"
                  >
                    {fullName(a.user)}
                  </Link>
                  <p className="text-xs text-gray-500 truncate">{a.user.email}</p>
                  {replacedOn.has(a.user.id) && (
                    <p className="text-xs text-amber-700">
                      Mijenja se: {replacedOn.get(a.user.id)!.map(formatDateKey).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editable ? (
                  <RoleSelect
                    value={a.role}
                    onChange={(role) =>
                      run(
                        () => setTeacherAssignmentRole({ assignmentId: a.id, role }),
                        'Uloga promijenjena.',
                      )
                    }
                    disabled={isPending}
                    ariaLabel={`Uloga: ${fullName(a.user)}`}
                    compact
                  />
                ) : (
                  <RoleBadge role={a.role} />
                )}
                {editable && (
                  <button
                    onClick={() => run(() => unassignTeacherFromGroup(a.id), 'Nastavnik uklonjen.')}
                    disabled={isPending}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
                    aria-label="Ukloni nastavnika"
                    title="Ukloni nastavnika"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {substitutes.map((s) => (
            <div
              key={s.key}
              className="flex items-start justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60"
            >
              <div className="flex items-start gap-2 min-w-0">
                <UserRoundPlus className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <Link
                    href={`/admin/nastavnici/${s.userId}`}
                    className="text-sm font-medium text-gray-900 hover:text-cyan-700 transition-colors"
                  >
                    {s.name}
                  </Link>
                  <p className="text-xs text-gray-600">
                    {staffChangeLabel({
                      replacesName: s.replacesName,
                      isRegular: regularIds.has(s.userId),
                    })}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.items.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white pl-2 pr-1 py-0.5 text-xs font-medium text-amber-800"
                      >
                        {formatDateKey(c.sessionDate)}
                        {editable && (
                          <button
                            onClick={() => askRemoveChange(c)}
                            disabled={isPending}
                            className="rounded-full p-0.5 text-amber-500 hover:text-red-600 disabled:opacity-50"
                            aria-label={`Ukloni zamjenu ${formatDateKey(c.sessionDate)}`}
                            title="Ukloni zamjenu za ovaj termin"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <RoleBadge role={s.role} />
            </div>
          ))}
        </div>
      )}

      <AddTeacherDialog
        open={teacherOpen}
        onOpenChange={setTeacherOpen}
        teachers={assignableTeachers}
        onSubmit={(teacherId, role) =>
          startTransition(async () => {
            const res = await assignTeacherToGroup({ teacherId, scheduledGroupId: groupId, role })
            if (res.success) {
              toast.success('Nastavnik dodijeljen.')
              setTeacherOpen(false)
              router.refresh()
            } else {
              toast.error(res.error)
            }
          })
        }
        isPending={isPending}
      />

      <AddSubstituteDialog
        open={substituteOpen}
        onOpenChange={setSubstituteOpen}
        regulars={regulars}
        people={people}
        changes={changes}
        terminSections={terminSections}
        isPending={isPending}
        onSubmit={(input) =>
          startTransition(async () => {
            const res = await addSessionStaffChange({ scheduledGroupId: groupId, ...input })
            if (res.success) {
              toast.success(
                input.sessionDates.length === 1
                  ? 'Zamjena dodana.'
                  : `Zamjena dodana za ${input.sessionDates.length} termina.`,
              )
              setSubstituteOpen(false)
              router.refresh()
            } else {
              toast.error(res.error)
            }
          })
        }
      />

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
    </div>
  )
}

type SubstituteGroup = {
  key: string
  userId: string
  name: string
  role: StaffRole
  replacesName: string | null
  items: GroupStaffChangeRow[]
}

/** One row per (person, whom they replace, role), dates as chips, earliest first. */
function groupChanges(changes: GroupStaffChangeRow[]): SubstituteGroup[] {
  const groups = new Map<string, SubstituteGroup>()
  for (const c of changes) {
    const key = `${c.userId}|${c.replacesUserId ?? ''}|${c.role}`
    const g = groups.get(key)
    if (g) g.items.push(c)
    else
      groups.set(key, {
        key,
        userId: c.userId,
        name: c.name,
        role: c.role,
        replacesName: c.replacesName,
        items: [c],
      })
  }
  for (const g of groups.values()) g.items.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
  return [...groups.values()].sort((a, b) =>
    a.items[0].sessionDate.localeCompare(b.items[0].sessionDate),
  )
}

// ─── Dodaj nastavnika ──────────────────────────────────────────────────────

function AddTeacherDialog({
  open,
  onOpenChange,
  teachers,
  onSubmit,
  isPending,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  teachers: Person[]
  onSubmit: (teacherId: string, role: StaffRole) => void
  isPending: boolean
}>) {
  const [teacherId, setTeacherId] = useState('')
  const [role, setRole] = useState<StaffRole>('LEAD')

  const change = (next: boolean) => {
    if (!next) {
      setTeacherId('')
      setRole('LEAD')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dodaj nastavnika</DialogTitle>
          <DialogDescription>Stalni nastavnik grupe, na svim terminima.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="assign-teacher-select" className={LABEL}>
              Nastavnik
            </label>
            <select
              id="assign-teacher-select"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className={SELECT}
            >
              <option value="">– Odaberite nastavnika –</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t)} ({t.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="assign-teacher-role" className={LABEL}>
              Uloga na grupi
            </label>
            <RoleSelect id="assign-teacher-role" value={role} onChange={setRole} disabled={isPending} />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => change(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={() => onSubmit(teacherId, role)}
            disabled={isPending || !teacherId}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Dodjeljujem...' : 'Dodijeli'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dodaj zamjenu ─────────────────────────────────────────────────────────

type SubstituteInput = {
  sessionDates: string[]
  userId: string
  role: StaffRole
  replacesUserId: string
}

function AddSubstituteDialog({
  open,
  onOpenChange,
  regulars,
  people,
  changes,
  terminSections,
  isPending,
  onSubmit,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  regulars: Assignment[]
  people: Person[]
  changes: GroupStaffChangeRow[]
  terminSections: TerminSection[]
  isPending: boolean
  onSubmit: (input: SubstituteInput) => void
}>) {
  const [replacesUserId, setReplacesUserId] = useState('')
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<StaffRole>('LEAD')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const change = (next: boolean) => {
    if (!next) {
      setReplacesUserId('')
      setUserId('')
      setRole('LEAD')
      setPicked(new Set())
    }
    onOpenChange(next)
  }

  // A date that already carries a change for either person cannot take another
  // one — the server refuses it too, this just says so before the click.
  const taken = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of changes) {
      if (userId && c.userId === userId) map.set(c.sessionDate, 'već ima promjenu')
      if (replacesUserId && c.replacesUserId === replacesUserId) map.set(c.sessionDate, 'već ima zamjenu')
      if (replacesUserId && c.userId === replacesUserId) map.set(c.sessionDate, 'već ima promjenu')
    }
    return map
  }, [changes, userId, replacesUserId])

  const selected = [...picked].filter((d) => !taken.has(d))

  const pickReplaced = (id: string) => {
    setReplacesUserId(id)
    const r = regulars.find((x) => x.user.id === id)
    if (r) setRole(r.role)
  }

  const toggle = (d: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })

  const toggleSection = (dates: string[]) => {
    const free = dates.filter((d) => !taken.has(d))
    const allOn = free.length > 0 && free.every((d) => picked.has(d))
    setPicked((prev) => {
      const next = new Set(prev)
      for (const d of free) {
        if (allOn) next.delete(d)
        else next.add(d)
      }
      return next
    })
  }

  let submitLabel = 'Dodaj zamjenu'
  if (isPending) submitLabel = 'Spremam...'
  else if (selected.length > 1) submitLabel = `Dodaj za ${selected.length} termina`

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj zamjenu</DialogTitle>
          <DialogDescription>
            Vrijedi samo za odabrane termine. Zamjena vidi grupu do kraja zadnjeg od njih, a
            nakon toga se sama skida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="staff-change-replaces" className={LABEL}>
              Umjesto
            </label>
            <select
              id="staff-change-replaces"
              value={replacesUserId}
              onChange={(e) => pickReplaced(e.target.value)}
              className={SELECT}
            >
              <option value="">– Nikoga, dodatno na terminu –</option>
              {regulars.map((r) => (
                <option key={r.user.id} value={r.user.id}>
                  {fullName(r.user)} ({r.role === 'ASSISTANT' ? 'asistent' : 'predavač'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label htmlFor="staff-change-person" className={LABEL}>
                Tko dolazi
              </label>
              <select
                id="staff-change-person"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={SELECT}
              >
                <option value="">– Odaberite nastavnika –</option>
                {people
                  .filter((p) => p.id !== replacesUserId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {fullName(p)}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="staff-change-role" className={LABEL}>
                Uloga
              </label>
              <RoleSelect id="staff-change-role" value={role} onChange={setRole} disabled={isPending} />
            </div>
          </div>

          <fieldset>
            <legend className={LABEL}>Termini</legend>
            {terminSections.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Grupa nema nadolazećih termina.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                {terminSections.map((section) => {
                  const free = section.dates.filter((d) => !taken.has(d))
                  const allOn = free.length > 0 && free.every((d) => picked.has(d))
                  return (
                    <div key={section.title} className="p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-700">{section.title}</span>
                        {free.length > 1 && (
                          <button
                            type="button"
                            onClick={() => toggleSection(section.dates)}
                            className="text-xs font-medium text-cyan-700 hover:text-cyan-900"
                          >
                            {allOn ? 'Poništi' : 'Odaberi sve'}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {section.dates.map((d) => (
                          <TerminCheckbox
                            key={d}
                            dateKey={d}
                            reason={taken.get(d) ?? null}
                            checked={picked.has(d)}
                            onToggle={() => toggle(d)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </fieldset>
        </div>

        <DialogFooter>
          <button
            onClick={() => change(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Odustani
          </button>
          <button
            onClick={() => onSubmit({ sessionDates: selected, userId, role, replacesUserId })}
            disabled={isPending || !userId || selected.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TerminCheckbox({
  dateKey,
  reason,
  checked,
  onToggle,
}: Readonly<{ dateKey: string; reason: string | null; checked: boolean; onToggle: () => void }>) {
  const on = !reason && checked
  let tone = 'cursor-pointer border-gray-200 bg-white text-gray-700 hover:border-gray-300'
  if (reason) tone = 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
  else if (on) tone = 'cursor-pointer border-cyan-600 bg-cyan-50 text-gray-900'
  return (
    <label
      title={reason ? `Na ovom terminu ${reason}.` : undefined}
      className={cn('inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm', tone)}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={!!reason}
        onChange={onToggle}
        className="size-4 accent-cyan-600"
      />
      {formatDateKey(dateKey)}
    </label>
  )
}
