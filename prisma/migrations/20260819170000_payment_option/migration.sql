-- How a family chose to settle an SLR program. Additive and safe against a live
-- database: one new enum type plus two nullable columns, no rewrite of existing
-- rows and deliberately NO backfill — NULL means "nije odabrano", never a guess
-- about how a family intends to pay.
CREATE TYPE "PaymentOption" AS ENUM ('PO_MODULU', 'CIJELA_GODINA');

ALTER TABLE "Inquiry" ADD COLUMN "paymentOption" "PaymentOption";
ALTER TABLE "Enrollment" ADD COLUMN "paymentOption" "PaymentOption";
