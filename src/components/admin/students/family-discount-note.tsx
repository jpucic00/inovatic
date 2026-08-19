import Link from 'next/link'
import { Users } from 'lucide-react'
import {
  FAMILY_DISCOUNT_NOTE,
  FAMILY_DISCOUNT_TITLE,
  type FamilySibling,
} from '@/lib/family-discount'

interface Props {
  /** School year this enrollment belongs to — the year the siblings share. */
  schoolYear: string
  siblings: readonly FamilySibling[]
}

/**
 * "Popust za brata/sestru" on an SLR enrollment card.
 *
 * It names the sibling and links to their profile rather than just asserting a
 * discount, because the family is inferred from `User.parentEmail` — which is
 * explicitly NOT a family identifier (the doctrine the EVALUATION and CREDENTIALS
 * campaigns are built on: nothing stops two unrelated children sharing a mistyped
 * or institutional address). Naming them turns an unverifiable badge into a claim
 * an admin can check in one click, and stating their program shows WHY it fired —
 * a sibling in the competitive program counts too, which is not guessable from a
 * bare badge.
 */
export function FamilyDiscountNote({ schoolYear, siblings }: Readonly<Props>) {
  if (siblings.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-900">
          <Users className="w-3.5 h-3.5 shrink-0" />
          {FAMILY_DISCOUNT_TITLE}
        </p>
        <p className="mt-1 text-xs text-violet-800">
          U školskoj godini {schoolYear} program pohađa i{' '}
          {siblings.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <Link
                href={`/admin/ucenici/${s.id}`}
                className="font-medium underline underline-offset-2 hover:text-violet-950"
              >
                {s.firstName} {s.lastName}
              </Link>
              {s.programTitles.length > 0 && ` (${s.programTitles.join(', ')})`}
            </span>
          ))}
          .
        </p>
        <p className="mt-1 text-xs text-violet-700">{FAMILY_DISCOUNT_NOTE}</p>
      </div>
    </div>
  )
}
