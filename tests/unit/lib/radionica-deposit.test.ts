/**
 * The radionica booking deposit is derived (20% of the workshop's price), not
 * stored, so the arithmetic and the "is anything owed at all" answer are worth
 * pinning down on their own. How the figure reaches a parent is covered in
 * `inquiry-confirmation-email.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { radionicaDepositAmount } from '@/lib/radionica-deposit'

describe('radionicaDepositAmount', () => {
  it('is 20% of the price, as Croatian money copy', () => {
    // The Ljetni kamp ciklus: 150 € → the 30 € akontacija the association quotes.
    expect(radionicaDepositAmount(150)).toBe('30,00 eura')
    expect(radionicaDepositAmount(60)).toBe('12,00 eura')
  })

  it('always shows two decimals, rounding a fractional share', () => {
    expect(radionicaDepositAmount(100)).toBe('20,00 eura')
    expect(radionicaDepositAmount(99.99)).toBe('20,00 eura')
    expect(radionicaDepositAmount(37)).toBe('7,40 eura')
  })

  it('asks for nothing when the radionica is free or not yet priced', () => {
    expect(radionicaDepositAmount(null)).toBeNull()
    expect(radionicaDepositAmount(undefined)).toBeNull()
    expect(radionicaDepositAmount(0)).toBeNull()
    expect(radionicaDepositAmount(-50)).toBeNull()
  })
})
