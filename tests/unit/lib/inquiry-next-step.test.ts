/**
 * The confirmation e-mail and the form's success screen both promise the parent
 * what happens next, and both used to hardcode "kontaktirat ćemo vas s
 * dostupnim terminima" — written before the form had a termin dropdown, and by
 * then wrong in two places at once. The decision and the copy are shared so a
 * correction cannot land on only one of them.
 */
import { describe, expect, it } from 'vitest'
import {
  inquiryNextStepText,
  inquiryNextStep,
  type InquiryNextStep,
} from '@/lib/inquiry-next-step'

describe('inquiryNextStep', () => {
  it('confirms the booking when a termin was chosen', () => {
    expect(inquiryNextStep({ scheduledGroupId: 'group-1' })).toBe('TERMIN_CHOSEN')
    // A booked termin wins: the refusal flag is only reachable without a group,
    // but nothing downstream should depend on that being enforced elsewhere.
    expect(
      inquiryNextStep({ scheduledGroupId: 'group-1', noSuitableTermin: true }),
    ).toBe('TERMIN_CHOSEN')
  })

  it('promises to arrange one when the offered termini were refused', () => {
    expect(inquiryNextStep({ noSuitableTermin: true })).toBe('TERMIN_TO_ARRANGE')
  })

  it('falls back to offering termini when nothing was picked', () => {
    expect(inquiryNextStep({})).toBe('TERMIN_TO_OFFER')
    expect(inquiryNextStep({ noSuitableTermin: false })).toBe('TERMIN_TO_OFFER')
  })

  /**
   * The probni sat outranks the termin arms: it is the next thing that actually
   * happens to this family, and the upis is what follows it rather than what
   * this form produced.
   */
  it('leads with the probni sat when one was granted with a date', () => {
    expect(
      inquiryNextStep({
        scheduledGroupId: 'group-1',
        wantsTrial: true,
        trialDateLabel: '15.09.2026.',
      }),
    ).toBe('TRIAL_BOOKED')
  })

  it('promises to arrange the probni sat when no date could be derived', () => {
    expect(inquiryNextStep({ wantsTrial: true })).toBe('TRIAL_TO_ARRANGE')
    // A booked group whose year has no trial week lands here too.
    expect(
      inquiryNextStep({ scheduledGroupId: 'group-1', wantsTrial: true }),
    ).toBe('TRIAL_TO_ARRANGE')
  })

  it('ignores a trial that was not granted', () => {
    expect(
      inquiryNextStep({ scheduledGroupId: 'group-1', wantsTrial: false }),
    ).toBe('TERMIN_CHOSEN')
  })
})

describe('inquiryNextStepText', () => {
  const steps: InquiryNextStep[] = [
    'TRIAL_BOOKED',
    'TRIAL_TO_ARRANGE',
    'TERMIN_CHOSEN',
    'TERMIN_TO_ARRANGE',
    'TERMIN_TO_OFFER',
  ]

  it('has distinct, non-empty copy for every step', () => {
    const texts = steps.map((s) => inquiryNextStepText(s, { trialDateLabel: '15.09.2026.' }))
    expect(texts.every((t) => t.length > 0)).toBe(true)
    expect(new Set(texts).size).toBe(steps.length)
  })

  it('offers termini only in the case where none was on the table', () => {
    // The whole point of the split: a parent who booked a slot, and one who
    // told us the offered slots do not suit them, must not be told their
    // termini are still coming.
    expect(inquiryNextStepText('TERMIN_CHOSEN')).not.toContain('dostupnim terminima')
    expect(inquiryNextStepText('TERMIN_TO_ARRANGE')).not.toContain('dostupnim terminima')
    expect(inquiryNextStepText('TERMIN_TO_OFFER')).toContain('dostupnim terminima')
  })

  it('names the promised date in the booked-trial sentence', () => {
    expect(inquiryNextStepText('TRIAL_BOOKED', { trialDateLabel: '15.09.2026.' })).toContain(
      '15.09.2026.',
    )
  })

  /**
   * Unreachable through `inquiryNextStep`, but handled rather than trusted: a
   * missing date must degrade to the "we'll arrange it" sentence, never print an
   * empty gap where a date should be.
   */
  it('degrades to the arrange-it sentence when the date is missing', () => {
    expect(inquiryNextStepText('TRIAL_BOOKED')).toBe(
      inquiryNextStepText('TRIAL_TO_ARRANGE'),
    )
  })
})
