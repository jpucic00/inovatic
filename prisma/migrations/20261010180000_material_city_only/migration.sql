-- Materijali v2 (4/4, Flux qsb7uru): curriculum materials are shared by both
-- cities by default — the owner wants Split and Šibenik on the same curriculum.
-- A material may be limited to ONE city only as a deliberate step with a stated
-- reason, so the other city can see that (and why) it differs.
--
-- Additive: every existing row stays shared (city NULL).

ALTER TABLE "Material" ADD COLUMN "city" "City",
ADD COLUMN "cityOnlyReason" TEXT;

-- A city-only material always carries its reason, and only curriculum rows can
-- be city-only: a GROUP row already belongs to its group's city.
ALTER TABLE "Material" ADD CONSTRAINT "Material_city_only_check"
  CHECK (
    ("city" IS NULL AND "cityOnlyReason" IS NULL) OR
    ("city" IS NOT NULL AND "cityOnlyReason" IS NOT NULL
      AND "scope" IN ('LESSON', 'MODULE', 'COURSE'))
  );
