/**
 * Akontacija (booking deposit) for a radionica, as quoted to the parent in the
 * sign-up confirmation e-mail.
 *
 * The figure is always 20% of the workshop's own price — a 150 € ciklus asks
 * for 30 € — so it is derived rather than stored: correcting a price in the
 * admin carries straight through to the next confirmation with nothing else to
 * remember. A radionica with no price is free (or not priced yet) and must ask
 * for nothing at all, which is why this returns null rather than "0,00 eura" —
 * the caller drops the whole NAPOMENA block on null instead of mailing a parent
 * a payment instruction for a workshop that costs nothing.
 */
const DEPOSIT_RATE = 0.2

/** Croatian money copy, e.g. 150 → "30,00 eura". Null when nothing is owed. */
export function radionicaDepositAmount(price: number | null | undefined): string | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null
  const amount = new Intl.NumberFormat('hr-HR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price * DEPOSIT_RATE)
  return `${amount} eura`
}
