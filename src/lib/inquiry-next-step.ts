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
 * - `TERMIN_CHOSEN` — a termin was booked in the dropdown. Nothing is left to
 *   offer; what remains is an admin turning the inquiry into an account, so the
 *   promise is the upis confirmation and deliberately not the upis itself.
 * - `TERMIN_TO_ARRANGE` — the competitive program's "Ne odgovara mi predloženi
 *   termin" answer. They have seen the termini and refused them, so the next
 *   step is agreeing on one, not sending the same list again.
 * - `TERMIN_TO_OFFER` — nothing was bookable (every radionica termin has passed,
 *   or the grade has no open group). The original sentence, still true here, and
 *   the safe default.
 *
 * There were briefly two more arms for the probni sat, when the parent could ask
 * for a trial lesson on the form itself. That request path was removed — staff
 * pick who is new and mail the termin when they schedule it — so none of these
 * sentences mentions the trial. The probni tjedan itself is unaffected.
 */
export type InquiryNextStep = 'TERMIN_CHOSEN' | 'TERMIN_TO_ARRANGE' | 'TERMIN_TO_OFFER'

/**
 * Named arguments rather than positionals: two booleans side by side would let a
 * mis-ordered call pick a plausible wrong sentence silently.
 */
export function inquiryNextStep(input: {
  scheduledGroupId?: string | null
  noSuitableTermin?: boolean | null
}): InquiryNextStep {
  if (input.scheduledGroupId) return 'TERMIN_CHOSEN'
  if (input.noSuitableTermin) return 'TERMIN_TO_ARRANGE'
  return 'TERMIN_TO_OFFER'
}

/** The sentence for a resolved step. */
export function inquiryNextStepText(step: InquiryNextStep): string {
  switch (step) {
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
