import { AlertTriangle } from 'lucide-react'
import type { ParentLinkPreview } from '@/lib/parent-account'

/**
 * What an admin is confirming when a child's parent account changes hands or
 * joins an account that already sees other children. Worded as consequences,
 * because the whole point is that e-mail now decides who sees a child's grades
 * and photos. Children in the other city are counted, never named — the same
 * masking the returning-student hint uses.
 */
export function ParentLinkNotice({ preview }: Readonly<{ preview: ParentLinkPreview }>) {
  const others = preview.otherChildren.join(', ')
  const otherCity =
    preview.otherCityChildren > 0
      ? `${preview.otherCityChildren} ${preview.otherCityChildren === 1 ? 'dijete' : 'djece'} u drugom gradu`
      : ''
  const sees = [others, otherCity].filter(Boolean).join(' i ')

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1.5">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="w-4 h-4" />
        Roditeljski račun
      </p>
      {preview.previousEmail && (
        <p>
          Dijete je dosad bilo povezano s računom <strong>{preview.previousEmail}</strong>. Nakon ovoga
          vidjet će ga samo <strong>{preview.email}</strong>.
        </p>
      )}
      {preview.staffName && (
        <p>
          <strong>{preview.email}</strong> je račun djelatnika {preview.staffName} — dijete će se otvarati
          s te prijave.
        </p>
      )}
      {sees && (
        <p>
          Račun <strong>{preview.email}</strong> već vidi: {sees}.
        </p>
      )}
    </div>
  )
}
