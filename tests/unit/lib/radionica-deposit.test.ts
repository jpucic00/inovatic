/**
 * The radionica payment figures are derived (20% akontacija, a flat 20 € popust
 * off the ostatak), not stored, so the arithmetic and the "is anything owed at
 * all" answer are worth pinning down on their own. How the figures reach a
 * parent is covered in `inquiry-confirmation-email.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { radionicaPaymentPlan } from '@/lib/radionica-deposit'

describe('radionicaPaymentPlan', () => {
  it('splits the price into the akontacija and the ostatak', () => {
    // The Ljetni kamp ciklus: 150 € → the 30 € akontacija the association
    // quotes, 120 € left, 100 € left with the popust.
    expect(radionicaPaymentPlan(150)).toEqual({
      deposit: '30,00',
      remainder: '120,00',
      total: '150,00',
      discountedRemainder: '100,00',
      discountedTotal: '130,00',
    })
  })

  it('takes the 20 € popust off the ostatak, never off the akontacija', () => {
    const plan = radionicaPaymentPlan(200)

    // A family pays the same deposit either way and only settles less at the end.
    expect(plan?.deposit).toBe('40,00')
    expect(plan?.remainder).toBe('160,00')
    expect(plan?.discountedRemainder).toBe('140,00')
    expect(plan?.discountedTotal).toBe('180,00')
  })

  it('always shows two decimals, and the parts add up to the stated total', () => {
    // 99,99 € splits 20,00 / 79,99 — a parent checking the addition must not
    // find the quoted total a cent out.
    expect(radionicaPaymentPlan(99.99)).toMatchObject({
      deposit: '20,00',
      remainder: '79,99',
      total: '99,99',
    })
    expect(radionicaPaymentPlan(37)).toMatchObject({ deposit: '7,40', remainder: '29,60' })
  })

  it('drops the popust when it would leave nothing to pay after the akontacija', () => {
    // A 25 € radionica: 5 € deposit, 20 € left — the popust cancels it exactly,
    // and anything cheaper would quote a negative ostatak.
    expect(radionicaPaymentPlan(25)).toMatchObject({
      deposit: '5,00',
      remainder: '20,00',
      discountedRemainder: null,
      discountedTotal: null,
    })
    expect(radionicaPaymentPlan(20)?.discountedRemainder).toBeNull()
  })

  it('asks for nothing when the radionica is free or not yet priced', () => {
    expect(radionicaPaymentPlan(null)).toBeNull()
    expect(radionicaPaymentPlan(undefined)).toBeNull()
    expect(radionicaPaymentPlan(0)).toBeNull()
    expect(radionicaPaymentPlan(-50)).toBeNull()
  })
})
