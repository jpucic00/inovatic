# Attendance — Session Dates and Marking Flow

There is no `ClassSession` model. Expected session dates are derived on the fly from the group's weekday + module schedule windows. Attendance rows are keyed by `(enrollmentId, sessionDate)`.

## Session Date Computation

```mermaid
flowchart TD
    A["Input: group.dayOfWeek (Croatian weekday) + ModuleSchedule windows for group.schoolYear"] --> B{dayOfWeek parseable?}
    B -->|No - null or unknown| EMPTY[Return empty list]
    B -->|Yes| C[Filter windows: keep only those with both startDate AND endDate non-null]

    C --> D{Any valid windows?}
    D -->|No| EMPTY
    D -->|Yes| E[For each window: enumerate every occurrence of weekday between startDate and endDate]

    E --> F["Advance to first occurrence of weekday on/after startDate, then step +7 days until past endDate"]
    F --> G[Deduplicate across overlapping windows]
    G --> H[Sort ascending]
    H --> I["Output: expectedSessions list of YYYY-MM-DD strings"]

    style EMPTY fill:#fee2e2
    style I fill:#d1fae5
    style F fill:#e0f2fe
```

> Source: `computeExpectedSessions()` in `src/lib/session-dates.ts`. All dates use UTC midnight to match Prisma `@db.Date` storage.

## Extra Sessions

```mermaid
flowchart LR
    A[Load all Attendance records for the group] --> B[For each record, convert sessionDate to YYYY-MM-DD key]
    B --> C{Key in expectedSessions set?}
    C -->|Yes| NORMAL[Normal session]
    C -->|No| EXTRA["extraSessions — makeup or ad-hoc class"]

    style NORMAL fill:#d1fae5
    style EXTRA fill:#fef3c7
```

> Extra sessions appear when a teacher records attendance for a date that falls outside all module windows — typically a makeup class. The UI renders them alongside expected dates.

## Teacher Bulk-Mark Flow

```mermaid
sequenceDiagram
    actor Teacher
    participant UI as AttendanceMarker component
    participant Server as bulkMarkSession action
    participant DB as Database

    Teacher->>UI: Selects a session date from the date picker
    UI->>UI: Loads roster for the group, pre-fills existing records for that date

    Teacher->>UI: Marks each student as Prisutan/Odsutan, optional notes
    Teacher->>UI: Clicks Save

    UI->>Server: bulkMarkSession(groupId, sessionDate, entries[])

    Server->>Server: Zod validation (bulkMarkSessionSchema)
    Server->>Server: assertTeacherOwnsGroup(groupId) — ADMIN bypasses

    rect rgb(224, 242, 254)
        Note over Server,DB: $transaction (isolationLevel Serializable)
        Server->>DB: Fetch group.schoolYear
        Server->>DB: Verify all enrollmentIds belong to this group + schoolYear
        Note right of Server: If count mismatch → throw ENROLLMENT_MISMATCH (rolls back transaction)
        Server->>DB: Upsert Attendance for each entry
        Note right of DB: Upsert key: (enrollmentId, sessionDate). Sets present, note, recordedById.
    end

    Server-->>UI: Success
    UI->>UI: Toast confirmation
    Server->>Server: revalidatePath for teacher group + admin student pages
```

> Source: `bulkMarkSession()` in `src/actions/teacher/attendance.ts`. The upsert means re-saving the same date updates existing records rather than creating duplicates.

## Default Session Selection

```mermaid
flowchart TD
    A[AttendanceMarker opens] --> B{Is today in expectedSessions or extraSessions?}
    B -->|Yes| C[Select today]
    B -->|No| D[Find nearest past session date]
    D --> E{Found?}
    E -->|Yes| F[Select nearest past]
    E -->|No| G[Find nearest upcoming session date]
    G --> H{Found?}
    H -->|Yes| I[Select nearest upcoming]
    H -->|No| J[No session selected]

    style C fill:#d1fae5
    style F fill:#e0f2fe
    style I fill:#fef3c7
    style J fill:#fee2e2
```
