import { describe, expect, it } from 'vitest'
import type { ProgramKind } from '@prisma/client'
import {
  PAYMENT_OPTION_LABELS,
  PAYMENT_OPTION_VALUES,
  offersPaymentOption,
  paymentOptionLabel,
} from '@/lib/payment-option'

describe('offersPaymentOption', () => {
  // This one predicate decides three separate things — whether the public form
  // renders the field, whether `submitInquiry` keeps a submitted value, and
  // whether an admin may set one on an enrollment. Getting it wrong in either
  // direction means the UI offers what the server refuses, or the reverse.
  it('offers the choice on the SLR ladder', () => {
    expect(offersPaymentOption('STANDARD')).toBe(true)
  })

  it('offers nothing on a radionica — its plan is a fixed akontacija + ostatak', () => {
    expect(offersPaymentOption('RADIONICA')).toBe(false)
  })

  it('offers nothing on the natjecateljski program — it is billed monthly', () => {
    expect(offersPaymentOption('COMPETITION')).toBe(false)
  })

  it('covers every ProgramKind, so a fourth kind cannot default to "offered"', () => {
    const kinds: ProgramKind[] = ['STANDARD', 'RADIONICA', 'COMPETITION']
    expect(kinds.filter(offersPaymentOption)).toEqual(['STANDARD'])
  })
})

describe('paymentOptionLabel', () => {
  it('names exactly the two options the public price band quotes', () => {
    expect(PAYMENT_OPTION_VALUES).toEqual(['PO_MODULU', 'CIJELA_GODINA'])
    expect(paymentOptionLabel('PO_MODULU')).toBe('Po modulu')
    expect(paymentOptionLabel('CIJELA_GODINA')).toBe('Cijela školska godina')
  })

  it('has a label for every value', () => {
    for (const value of PAYMENT_OPTION_VALUES) {
      expect(PAYMENT_OPTION_LABELS[value]).toBeTruthy()
    }
  })

  it('returns null for "nije odabrano" rather than inventing a default', () => {
    // Null is a real third state: an admin must be able to see that the question
    // is still open, not read a guess as the family's answer.
    expect(paymentOptionLabel(null)).toBeNull()
    expect(paymentOptionLabel(undefined)).toBeNull()
  })
})
