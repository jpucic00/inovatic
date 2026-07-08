-- Drop dead columns: Course.priceYear/priceModule, User.emailVerified,
-- Location.lat/lng, Inquiry.courseLevelPref/locationPref.
-- DB is cleared before launch; no data migration needed.

ALTER TABLE "Course" DROP COLUMN IF EXISTS "priceYear";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "priceModule";

ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerified";

ALTER TABLE "Location" DROP COLUMN IF EXISTS "lat";
ALTER TABLE "Location" DROP COLUMN IF EXISTS "lng";

ALTER TABLE "Inquiry" DROP COLUMN IF EXISTS "courseLevelPref";
ALTER TABLE "Inquiry" DROP COLUMN IF EXISTS "locationPref";
