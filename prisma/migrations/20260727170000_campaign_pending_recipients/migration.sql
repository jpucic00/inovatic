-- Every intended recipient is now written upfront as PENDING, so the campaign
-- detail view lists the whole cohort immediately and an interrupted send knows
-- exactly who is still owed an e-mail (the cohort cannot always be re-resolved:
-- preporuka campaigns store display labels, not the encoded filter values).

ALTER TYPE "EmailRecipientStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "EmailRecipientStatus" ADD VALUE IF NOT EXISTS 'ALREADY_SENT';
