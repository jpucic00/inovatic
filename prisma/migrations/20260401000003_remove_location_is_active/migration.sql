-- Remove isActive column from Location
-- Locations can now be deleted instead; FK constraint on ScheduledGroup prevents deleting locations with groups
ALTER TABLE "Location" DROP COLUMN "isActive";
