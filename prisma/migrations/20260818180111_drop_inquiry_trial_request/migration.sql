-- The probni sat leaves the public signup form (Flux rgyemhz). The parent no
-- longer asks for a trial lesson, so the two columns that recorded that request
-- have nothing left to hold: staff decide who is new (the "Ponovni upis" marker
-- already tells them) and mail the termin when they schedule it.
--
-- SAFE TO DROP, which is not the usual answer for a column:
--   * `20260817152101_trial_week` added them and has NEVER been deployed — it is
--     still an unpushed commit, so no production database has ever had them.
--   * Nothing wrote a meaningful value even locally: `wantsTrial` was only ever
--     its `false` default (the offer required a TrialWeek row, and none exists
--     in any environment) and `trialDate` was never non-null.
-- Should this ever run somewhere that DID collect answers, the data lost is one
-- boolean and one date per upit, both re-derivable from the child's identity.
--
-- `TrialWeek` itself is untouched and stays: the probni tjedan is still planned
-- per city, still shows up in Dolazak, and still books the teacher's hour.
ALTER TABLE "Inquiry" DROP COLUMN "wantsTrial",
DROP COLUMN "trialDate";
