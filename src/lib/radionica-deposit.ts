/**
 * What a radionica parent is asked to pay, as quoted in the sign-up
 * confirmation e-mail: a booking akontacija up front and the rest before the
 * ciklus starts.
 *
 * Every figure is derived from the workshop's own `Course.price` rather than
 * stored, so correcting a price in the admin carries straight through to the
 * next confirmation with nothing else to remember:
 *
 *   akontacija = 20% of the price          (150 € ciklus → 30 €)
 *   ostatak    = price − akontacija        (→ 120 €)
 *   s popustom = price − 20 € − akontacija (→ 100 €, ukupno 130 €)
 *
 * The popust (drugo dijete / cjelogodišnji polaznik) is a flat 20 € off the
 * total, not a share of it, and it never touches the akontacija — a family
 * pays the same deposit either way and only settles less at the end.
 *
 * A radionica with no price is free (or not priced yet) and must ask for
 * nothing at all, which is why this returns null rather than a plan full of
 * "0,00" — the caller drops the whole NAPOMENA block instead of mailing a
 * parent a payment instruction for a workshop that costs nothing.
 */
const DEPOSIT_RATE = 0.2
const DISCOUNT_CENTS = 20 * 100

/**
 * Croatian money copy WITHOUT a unit ("120,00") — the e-mail appends "EUR" or
 * "eura" itself, since the same figure reads both ways in one message.
 */
export interface RadionicaPaymentPlan {
  /** Booking deposit, due within 3 days of signing up. */
  deposit: string
  /** What is left after the deposit, due before the ciklus starts. */
  remainder: string
  /** deposit + remainder — the full price, restated so the parent can check. */
  total: string
  /**
   * The same remainder less the 20 € popust, and the total it adds up to.
   * Null together on a workshop cheap enough that the discount would leave
   * nothing (or less than nothing) to pay after the deposit — quoting a
   * negative "ostatak" is arithmetic, not a policy the association has.
   */
  discountedRemainder: string | null
  discountedTotal: string | null
}

/** Croatian money copy from integer cents, e.g. 12000 → "120,00". */
function money(cents: number): string {
  return new Intl.NumberFormat('hr-HR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function radionicaPaymentPlan(
  price: number | null | undefined,
): RadionicaPaymentPlan | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null

  // Everything is computed in integer cents off one rounded total so the parts
  // an e-mail states side by side add up exactly — a parent reading
  // "30,00 + 120,00 (ukupno 150,00)" must never find it 0,01 out.
  const totalCents = Math.round(price * 100)
  const depositCents = Math.round(totalCents * DEPOSIT_RATE)
  const remainderCents = totalCents - depositCents
  const discountedRemainderCents = remainderCents - DISCOUNT_CENTS
  const hasDiscount = discountedRemainderCents > 0

  return {
    deposit: money(depositCents),
    remainder: money(remainderCents),
    total: money(totalCents),
    discountedRemainder: hasDiscount ? money(discountedRemainderCents) : null,
    discountedTotal: hasDiscount ? money(totalCents - DISCOUNT_CENTS) : null,
  }
}
