-- CreateTable
CREATE TABLE "TeacherAttendance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledGroupId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "present" BOOLEAN NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherAttendance_userId_sessionDate_idx" ON "TeacherAttendance"("userId", "sessionDate");

-- CreateIndex
CREATE INDEX "TeacherAttendance_scheduledGroupId_sessionDate_idx" ON "TeacherAttendance"("scheduledGroupId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAttendance_userId_scheduledGroupId_sessionDate_key" ON "TeacherAttendance"("userId", "scheduledGroupId", "sessionDate");

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_scheduledGroupId_fkey" FOREIGN KEY ("scheduledGroupId") REFERENCES "ScheduledGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: teaching hours used to be derived from who authored the student
-- attendance. Replay that rule once so months already worked keep their hours —
-- the recorder if they are assigned to the group (latest write wins), otherwise
-- the group's teacher when there is exactly one. Ambiguous sessions (an outsider
-- recorded a group with 0 or 2+ teachers) were never credited and stay empty.
WITH recorders AS (
    SELECT e."scheduledGroupId" AS group_id,
           a."sessionDate"      AS session_date,
           a."recordedById"     AS user_id,
           MAX(a."updatedAt")   AS last_write
      FROM "Attendance" a
      JOIN "Enrollment" e ON e.id = a."enrollmentId"
     GROUP BY 1, 2, 3
), assigned_recorder AS (
    SELECT group_id, session_date, user_id
      FROM (
        SELECT r.*,
               ROW_NUMBER() OVER (
                 PARTITION BY r.group_id, r.session_date
                 ORDER BY r.last_write DESC, r.user_id
               ) AS rank
          FROM recorders r
          JOIN "TeacherAssignment" ta
            ON ta."scheduledGroupId" = r.group_id AND ta."userId" = r.user_id
      ) ranked
     WHERE rank = 1
), sole_teacher AS (
    SELECT "scheduledGroupId" AS group_id, MIN("userId") AS user_id
      FROM "TeacherAssignment"
     GROUP BY 1
    HAVING COUNT(*) = 1
), sessions AS (
    SELECT DISTINCT group_id, session_date FROM recorders
)
INSERT INTO "TeacherAttendance" (
    "id", "userId", "scheduledGroupId", "sessionDate", "present", "recordedById", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text,
       COALESCE(ar.user_id, st.user_id),
       s.group_id,
       s.session_date,
       true,
       COALESCE(ar.user_id, st.user_id),
       NOW(),
       NOW()
  FROM sessions s
  LEFT JOIN assigned_recorder ar
    ON ar.group_id = s.group_id AND ar.session_date = s.session_date
  LEFT JOIN sole_teacher st ON st.group_id = s.group_id
 WHERE COALESCE(ar.user_id, st.user_id) IS NOT NULL;
