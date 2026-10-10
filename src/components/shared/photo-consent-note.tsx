import { CameraOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CONSENT_LABELS,
  CONSENT_SHORT_LABELS,
  consentRestrictions,
  PHOTO_CONSENT_KEYS,
  type EnrollmentConsents,
} from '@/lib/enrollment-consent'

/**
 * Whom not to photograph, said on the row itself — the Dolazak roster is the
 * screen a teacher has open in the classroom, the group page the one an admin
 * scans. Rendered only when something restricts: a child cleared for every
 * channel gets no marker, so the ones that matter stand out. A consent not
 * entered yet counts as withheld (amber, named apart from an explicit Ne) — a
 * missing form must never read as a yes.
 */
export function PhotoConsentNote({
  consents,
  className,
}: Readonly<{ consents: EnrollmentConsents; className?: string }>) {
  const { denied, missing } = consentRestrictions(consents, PHOTO_CONSENT_KEYS)
  if (denied.length === 0 && missing.length === 0) return null

  const short = (keys: readonly (keyof typeof CONSENT_SHORT_LABELS)[]) =>
    keys.map((k) => CONSENT_SHORT_LABELS[k]).join(', ')
  const long = (keys: readonly (keyof typeof CONSENT_LABELS)[]) =>
    keys.map((k) => CONSENT_LABELS[k]).join(', ')
  const title = [
    denied.length > 0 && `Roditelj nije dao privolu: ${long(denied)}`,
    missing.length > 0 && `Privola još nije unesena (ne objavljivati): ${long(missing)}`,
  ]
    .filter(Boolean)
    .join('. ')

  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)} title={title}>
      <CameraOff className="size-3 shrink-0 text-red-600" aria-hidden />
      <span className="sr-only">{title}</span>
      {denied.length > 0 ? (
        <span aria-hidden className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
          Ne objavljivati: {short(denied)}
        </span>
      ) : null}
      {missing.length > 0 ? (
        <span aria-hidden className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
          Nije uneseno: {short(missing)}
        </span>
      ) : null}
    </span>
  )
}
