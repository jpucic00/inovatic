-- Enum value added ALONE, in its own migration — the same split SCHEDULE and
-- CREDENTIALS used: Postgres cannot USE a value added by ALTER TYPE inside the
-- transaction that adds it, and Prisma wraps each file in one. Nothing else
-- changes: the PDF rides the existing EmailAttachment tables.
--
-- Additive and safe on a live database. Irreversible: removing an enum value
-- needs the full type-rewrite dance. If this kind is ever retired, leave the
-- value in place and stop writing it.
ALTER TYPE "EmailCampaignKind" ADD VALUE 'SCHOOL_CALENDAR';
