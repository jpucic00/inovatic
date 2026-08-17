/**
 * What actually happens after an inquiry is submitted — and the one sentence
 * that says so, shared by the confirmation e-mail and the form's success screen.
 *
 * Both used to carry their own copy of "kontaktirat ćemo vas s dostupnim
 * terminima", written before the form had a termin dropdown. That sentence is
 * now wrong for most parents (they picked their own slot, so being told their
 * termin is still coming reads as if the choice never arrived) and it was wrong
 * in two places, which is why the decision and the wording live here rather than
 * being branched twice:
 *
 * - `TRIAL_BOOKED` — a first-timer asked for a probni sat and a concrete date
 *   came out of it. That date is the next thing that happens to this family, so
 *   it outranks everything below; the upis is what follows the trial, not this
 *   form.
 * - `TRIAL_TO_ARRANGE` — a probni sat was requested but no group was booked, so
 *   there is no date to derive. We owe them one.
 * - `TERMIN_CHOSEN` — a termin was booked in the dropdown. Nothing is left to
 *   offer; what remains is an admin turning the inquiry into an account, so the
 *   promise is the upis confirmation and deliberately not the upis itself.
 * - `TERMIN_TO_ARRANGE` — the competitive program's "Ne odgovara mi predloženi
 *   termin" answer. They have seen the termini and refused them, so the next
 *   step is agreeing on one, not sending the same list again.
 * - `TERMIN_TO_OFFER` — nothing was bookable (every radionica termin has passed,
 *   or the grade has no open group). The original sentence, still true here, and
 *   the safe default.
 */
export type InquiryNextStep =
  | 'TRIAL_BOOKED'
  | 'TRIAL_TO_ARRANGE'
  | 'TERMIN_CHOSEN'
  | 'TERMIN_TO_ARRANGE'
  | 'TERMIN_TO_OFFER'

/**
 * Named arguments rather than positionals: there are now four inputs, three of
 * them booleans/optionals, and a mis-ordered call would have picked a plausible
 * wrong sentence silently.
 */
export function inquiryNextStep(input: {
  scheduledGroupId?: string | null
  noSuitableTermin?: boolean | null
  wantsTrial?: boolean | null
  /** Already-formatted dd.MM.yyyy. — its presence is what makes the trial concrete. */
  trialDateLabel?: string | null
}): InquiryNextStep {
  if (input.wantsTrial) {
    return input.trialDateLabel ? 'TRIAL_BOOKED' : 'TRIAL_TO_ARRANGE'
  }
  if (input.scheduledGroupId) return 'TERMIN_CHOSEN'
  if (input.noSuitableTermin) return 'TERMIN_TO_ARRANGE'
  return 'TERMIN_TO_OFFER'
}

/**
 * The sentence for a resolved step. A function rather than the old `Record`
 * because the trial arm interpolates the promised date — keeping it a lookup
 * table would have pushed that interpolation out to the two call sites, which is
 * exactly the duplication this module exists to prevent.
 *
 * `TRIAL_BOOKED` without a label is impossible via `inquiryNextStep`, but is
 * handled rather than trusted: a missing date degrades to the "we'll arrange
 * it" sentence instead of printing an empty gap.
 */
export function inquiryNextStepText(
  step: InquiryNextStep,
  opts?: { trialDateLabel?: string | null },
): string {
  switch (step) {
    case 'TRIAL_BOOKED':
      return opts?.trialDateLabel
        ? `Vaše dijete očekujemo na besplatnom probnom satu ${opts.trialDateLabel}, u terminu ` +
          'odabrane grupe. Nakon probnog sata javit ćemo vam se s potvrdom upisa i svim ' +
          'potrebnim informacijama.'
        : TRIAL_TO_ARRANGE_TEXT
    case 'TRIAL_TO_ARRANGE':
      return TRIAL_TO_ARRANGE_TEXT
    case 'TERMIN_CHOSEN':
      return (
        'Vaš odabrani termin je zabilježen. Nakon pregleda prijave javit ćemo vam se s ' +
        'potvrdom upisa i svim potrebnim informacijama u najkraćem mogućem roku.'
      )
    case 'TERMIN_TO_ARRANGE':
      return (
        'Zabilježili smo da vam ponuđeni termini ne odgovaraju. Javit ćemo vam se u ' +
        'najkraćem mogućem roku kako bismo dogovorili termin koji vam odgovara.'
      )
    case 'TERMIN_TO_OFFER':
      return (
        'Naš tim će pregledati vašu prijavu i kontaktirati vas s dostupnim terminima i ' +
        'grupama u najkraćem mogućem roku.'
      )
  }
}

const TRIAL_TO_ARRANGE_TEXT =
  'Zabilježili smo da želite doći na besplatni probni sat. Javit ćemo vam se u ' +
  'najkraćem mogućem roku s terminom probnog sata.'
