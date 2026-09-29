'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmRequest } from '@/components/shared/confirm-dialog'
import { sendParentPasswordLink, sendStaffPasswordLink } from '@/actions/password-link'

type Target =
  /** A child's profile: the link goes to the child's parent login. */
  | { kind: 'parent'; studentId: string; email: string; childCount: number }
  /** A teacher's profile: the link goes to the teacher. */
  | { kind: 'staff'; userId: string; email: string }

/**
 * "Pošalji poveznicu za lozinku" — the only way staff help someone who lost
 * access, since nobody can read a password any more. Asks first, naming the
 * address, because the mail leaves the building and a parent link covers every
 * child on that login. Sending never changes the current password: it only
 * stops working once the recipient actually chooses a new one.
 */
export function SendPasswordLinkButton({ target }: Readonly<{ target: Target }>) {
  const router = useRouter()
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [isPending, startTransition] = useTransition()

  const send = () =>
    startTransition(async () => {
      const res =
        target.kind === 'parent'
          ? await sendParentPasswordLink(target.studentId)
          : await sendStaffPasswordLink(target.userId)
      if (res.success) {
        toast.success(`Poveznica poslana na ${res.email}.`)
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })

  const ask = () =>
    setRequest({
      title: 'Poslati poveznicu za lozinku?',
      description: (
        <>
          Poveznica ide na <strong>{target.email}</strong>
          {target.kind === 'parent' && target.childCount > 1
            ? ` i postavlja lozinku roditeljskog računa za svih ${target.childCount} djece na njemu.`
            : '.'}{' '}
          Dosadašnja lozinka vrijedi dok se nova ne postavi.
        </>
      ),
      confirmLabel: 'Pošalji',
      onConfirm: send,
    })

  return (
    <>
      <button
        type="button"
        onClick={ask}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
      >
        <KeyRound className="w-3.5 h-3.5" />
        {isPending ? 'Šaljem...' : 'Pošalji poveznicu za lozinku'}
      </button>
      <ConfirmDialog request={request} onClose={() => setRequest(null)} />
    </>
  )
}
