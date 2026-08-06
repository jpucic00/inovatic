/**
 * The confirmation e-mail and the form's success screen both promise the parent
 * what happens next, and both used to hardcode "kontaktirat ćemo vas s
 * dostupnim terminima" — written before the form had a termin dropdown, and by
 * then wrong in two places at once. The decision and the copy are shared so a
 * correction cannot land on only one of them.
 */
import { describe, expect, it } from 'vitest'
import {
  INQUIRY_NEXT_STEP_TEXT,
  inquiryNextStep,
  type InquiryNextStep,
} from '@/lib/inquiry-next-step'

describe('inquiryNextStep', () => {
  it('confirms the booking when a termin was chosen', () => {
    expect(inquiryNextStep('group-1', undefined)).toBe('TERMIN_CHOSEN')
    // A booked termin wins: the refusal flag is only reachable without a group,
    // but nothing downstream should depend on that being enforced elsewhere.
    expect(inquiryNextStep('group-1', true)).toBe('TERMIN_CHOSEN')
  })

  it('promises to arrange one when the offered termini were refused', () => {
    expect(inquiryNextStep(undefined, true)).toBe('TERMIN_TO_ARRANGE')
  })

  it('falls back to offering termini when nothing was picked', () => {
    expect(inquiryNextStep(undefined, undefined)).toBe('TERMIN_TO_OFFER')
    expect(inquiryNextStep(undefined, false)).toBe('TERMIN_TO_OFFER')
  })
})

describe('INQUIRY_NEXT_STEP_TEXT', () => {
  const steps: InquiryNextStep[] = ['TERMIN_CHOSEN', 'TERMIN_TO_ARRANGE', 'TERMIN_TO_OFFER']

  it('has distinct, non-empty copy for every step', () => {
    const texts = steps.map((s) => INQUIRY_NEXT_STEP_TEXT[s])
    expect(texts.every((t) => t.length > 0)).toBe(true)
    expect(new Set(texts).size).toBe(steps.length)
  })

  it('offers termini only in the case where none was on the table', () => {
    // The whole point of the split: a parent who booked a slot, and one who
    // told us the offered slots do not suit them, must not be told their
    // termini are still coming.
    expect(INQUIRY_NEXT_STEP_TEXT.TERMIN_CHOSEN).not.toContain('dostupnim terminima')
    expect(INQUIRY_NEXT_STEP_TEXT.TERMIN_TO_ARRANGE).not.toContain('dostupnim terminima')
    expect(INQUIRY_NEXT_STEP_TEXT.TERMIN_TO_OFFER).toContain('dostupnim terminima')
  })
})
