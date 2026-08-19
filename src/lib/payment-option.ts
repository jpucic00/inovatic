import type { PaymentOption, ProgramKind } from '@prisma/client'
import { hasDatedModules } from '@/lib/program-kind'

/**
 * The two ways a family may settle an SLR program, and the words an admin and a
 * parent read for each.
 *
 * These are exactly what the public price band offers ("400 EUR godišnje ili 110
 * EUR po modulu"), which is why the labels carry no program argument: unlike the
 * report-card rubric or the recommendation tracks, there is nothing here that
 * reads differently per course. A program that bills some other way simply has
 * no option at all — see {@link offersPaymentOption}.
 */
export const PAYMENT_OPTION_VALUES = ['PO_MODULU', 'CIJELA_GODINA'] as const

export const PAYMENT_OPTION_LABELS: Record<PaymentOption, string> = {
  PO_MODULU: 'Po modulu',
  CIJELA_GODINA: 'Cijela školska godina',
}

/**
 * Whether this program lets a family choose how to pay at all.
 *
 * STANDARD only, and expressed through `hasDatedModules` rather than a bare
 * `=== 'STANDARD'` so it moves with the same predicate `programsForSelection`
 * uses to keep radionice and the competitive program out of the razred-driven
 * catalog. A radionica is settled by a fixed akontacija + ostatak stated in its
 * confirmation e-mail, and the competitive program is billed month by month
 * across its season — in neither case is there a decision to record.
 *
 * This one predicate decides three things at once: whether the public form
 * renders the field, whether `submitInquiry` keeps a submitted value, and
 * whether an admin may set one on an enrollment. Keeping them on one rule is
 * what stops the UI from offering something the server will refuse.
 */
export function offersPaymentOption(kind: ProgramKind): boolean {
  return hasDatedModules(kind)
}

/** Display label for a stored option, or null when nothing was chosen. */
export function paymentOptionLabel(option: PaymentOption | null | undefined): string | null {
  return option ? PAYMENT_OPTION_LABELS[option] : null
}
