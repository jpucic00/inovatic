# Attendance — Session Dates and Marking Flow

There is no `ClassSession` model. Expected session dates are derived on the fly and Attendance rows are keyed by `(enrollmentId, sessionDate)` (`@db.Date`, UTC midnight). There are two derivations, both holiday-aware via `loadHolidayDateKeys(schoolYear, city)` — holiday calendars are **per-city**, and each group resolves against its own city's set (a Šibenik closure never moves a Split group's sessions, and a holiday's attendance-cascade delete is city-filtered for the same reason):

- **Standard programs** — dates come from the per-group **race-ahead module arc** (`getGroupModuleArc`): up to 4 modules × 7 weekday sessions, anchored at the school-year kickoff (M1 `startDate`), skipping holidays. `getGroupAttendance` slices these into per-module sections.
- **Radionice** (`course.isCustom`) — `computeRadionicaSessions` enumerates every day in the `[dateStart, dateEnd]` range, skipping Sundays and holidays. The flat list is preserved (no module sections).

> A holiday is pre-filtered out of the expected set so attendance never shows a slot for it. Any further cancellation (snow day, ad-hoc) is the teacher's call — they leave the row unmarked or write a note.

## Standard groups — per-group race-ahead arc

`getGroupAttendance` (standard branch) builds the arc, then maps each `CourseModule` to a section. Session dates per section are the arc entry's 7 dates — **not** the raw `ModuleSchedule` windows.

```mermaid
flowchart TD
    A["getGroupAttendance(groupId) — standard branch"] --> B["loadHolidayDateKeys(group.schoolYear, group.city) → holidayDates set"]
    B --> C["getGroupModuleArc(dayOfWeek, modules + ModuleSchedule for this year AND this group's city, holidayDates)"]
    C --> D["Race-ahead: M1 anchors at its startDate; each later module's 1st session = next weekday after the previous module's 7th session"]
    D --> E["collectWeekdaySessions skips any date in holidayDates → exactly 7 sessions per module"]
    E --> F{"Module has a schedule and 7 sessions fit?"}
    F -->|No| G["Arc stops early → that module and later ones get an empty section, moduleScheduleId null"]
    F -->|Yes| H["Section: expectedSessions = arc 7 dates; enrolledEnrollmentIds from ModuleEnrollment on this moduleScheduleId"]
    H --> I["Record-only dates not in any section → assignAdhocDateToSection: matching module's adhocSessions, else 'Ostali termini' (otherDates)"]

    style G fill:#fee2e2
    style H fill:#d1fae5
    style E fill:#e0f2fe
```

> **Per-group, race-ahead — not `ModuleSchedule` windows.** Source: `getGroupModuleArc` in `src/lib/group-module-arc.ts`. Module N+1 starts on the group's next weekday occurrence after Module N's 7th session, so two groups in the same course on different weekdays (or with different holiday counts) sit on different modules on the same calendar date. The `ModuleSchedule.startDate/endDate` rows stay the slowest-weekday reference for calendar headers and admin pages; the arc reads only M1's `startDate` (the kickoff) and models per-group breaks via the holiday set, not via gaps between module windows.

## `computeExpectedSessions` — weekday × module windows − holidays

The weekday-window primitive in `src/lib/session-dates.ts`. It enumerates each `dayOfWeek` occurrence inside the supplied `ModuleSchedule` windows, dedupes overlaps, drops holidays, and sorts. It now powers the **school-year planner** and the **group end-date** computation — *not* attendance sectioning (which uses the arc above).

```mermaid
flowchart TD
    A["Input: dayOfWeek + ModuleSchedule windows + holidayDates set"] --> B{dayOfWeek parseable?}
    B -->|No - null or unknown| EMPTY[Return empty list]
    B -->|Yes| C[Keep only windows with both startDate AND endDate non-null]
    C --> D{Any valid windows?}
    D -->|No| EMPTY
    D -->|Yes| E["For each window: advance to first weekday occurrence on/after startDate, step +7 days until past endDate"]
    E --> F{"Date in holidayDates set?"}
    F -->|Yes| SKIP[Skip - no session that week]
    F -->|No| G[Keep date]
    SKIP --> H[Deduplicate across overlapping windows, sort ascending]
    G --> H
    H --> I["Output: expectedSessions list of YYYY-MM-DD strings"]

    style EMPTY fill:#fee2e2
    style SKIP fill:#fef3c7
    style I fill:#d1fae5
    style F fill:#e0f2fe
```

> Source: `computeExpectedSessions()` in `src/lib/session-dates.ts`. All dates use UTC midnight to match Prisma `@db.Date` storage. Holidays arrive as a `Set` of `YYYY-MM-DD` keys from `loadHolidayDateKeys`. Standard groups have a fixed weekday (Pon–Sub), so no separate Sunday filter is needed here — only radionice need that (below).

## Radionice — `computeRadionicaSessions`

```mermaid
flowchart TD
    A["Input: dateStart, dateEnd (YYYY-MM-DD) + holidayDates set"] --> B{"Both bounds set AND end >= start?"}
    B -->|No| EMPTY[Return empty list]
    B -->|Yes| C[Step day-by-day from dateStart to dateEnd inclusive]
    C --> D{"Sunday — getUTCDay() is 0?"}
    D -->|Yes| SKIP[Skip — workshops never run on Nedjelja]
    D -->|No| E{"Date in holidayDates set?"}
    E -->|Yes| SKIP
    E -->|No| KEEP[Add to session list]

    style EMPTY fill:#fee2e2
    style SKIP fill:#fef3c7
    style KEEP fill:#d1fae5
    style D fill:#e0f2fe
```

> Source: `computeRadionicaSessions()` in `src/lib/session-dates.ts`. Each non-Sunday, non-holiday day in the closed range is one expected session. Sundays are excluded because the association never schedules on Nedjelja (matches `ACTIVE_WEEKDAYS`, which lists only Pon–Sub). `getGroupAttendance` (radionica branch) returns this flat list with no module sections.

## Extra / ad-hoc sessions

A recorded Attendance date that isn't an expected session is surfaced, never dropped.

```mermaid
flowchart LR
    A["For each Attendance record, key = YYYY-MM-DD"] --> B{"Key in an expected-session set?"}
    B -->|Yes| NORMAL[Normal session]
    B -->|No - standard| ADHOC["Bucket into the matching module's adhocSessions, else 'Ostali termini' (otherDates)"]
    B -->|No - radionica| EXTRA["extraSessions — makeup or ad-hoc class"]

    style NORMAL fill:#d1fae5
    style ADHOC fill:#fef3c7
    style EXTRA fill:#fef3c7
```

> Extra sessions appear when a teacher records attendance for a date outside the expected set — typically a makeup class, or a session held on what was pre-filtered as a holiday. Standard groups route it to the nearest module section (or "Ostali termini"); radionice collect it in `extraSessions`.

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
    Server->>Server: assertTeacherOwnsGroup(groupId) — ADMIN pass-through is city-bound (cross-city group 404s)

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

## Default Session Selection (standard groups)

`pickDefaultSelectedDate` picks the most relevant date from the arc state — standard branch only; the radionica branch returns no `defaultSelectedDate`.

```mermaid
flowchart TD
    A["AttendanceMarker opens — pickDefaultSelectedDate(arc)"] --> B["state = getActiveModuleForGroup(arc, today)"]
    B --> C{inProgressModule?}
    C -->|Yes| C1{today in its sessions?}
    C1 -->|Yes| PICK1[Select today]
    C1 -->|No| C2[Select nearest past session in module, else its first]
    C -->|No| D{lastCompletedModule?}
    D -->|Yes| D1[Select its nearest past session, else its last]
    D -->|No| E{nextEnrollingModule?}
    E -->|Yes| E1[Select its first session]
    E -->|No| F["Fallback: first section with any expected date, else today"]

    style PICK1 fill:#d1fae5
    style C2 fill:#e0f2fe
    style D1 fill:#e0f2fe
    style E1 fill:#fef3c7
    style F fill:#fee2e2
```

> Source: `pickDefaultSelectedDate()` in `src/actions/teacher/attendance.ts`. Driven entirely by the race-ahead arc (`getActiveModuleForGroup`), so the default date sits inside the module the group is actually on right now.
