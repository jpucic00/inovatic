# Attendance — Session Dates and Marking Flow

There is no `ClassSession` model. Expected session dates are derived on the fly and Attendance rows are keyed by `(enrollmentId, sessionDate)` (`@db.Date`, UTC midnight). There are three derivations — one per `ProgramKind`, branched via the `src/lib/program-kind.ts` predicates — all holiday-aware via `loadHolidayDateKeys(schoolYear, city)` — holiday calendars are **per-city**, and each group resolves against its own city's set (a Šibenik closure never moves a Split group's sessions, and a holiday's attendance-cascade delete is city-filtered for the same reason):

- **Standard programs** (`isStandard`) — dates come from the per-group **race-ahead module arc** (`getGroupModuleArc`): up to 4 modules × 7 weekday sessions, anchored at the school-year kickoff (M1 `startDate`), skipping holidays. `getGroupAttendance` slices these into per-module sections.
- **Radionice** (`isRadionica`) — `computeRadionicaSessions` enumerates every day in the `[dateStart, dateEnd]` range, skipping Sundays and holidays. The flat list is preserved (no module sections).
- **Natjecateljski program** (`isCompetition`) — `computeSeasonSessions({ dayOfWeek, startDate, endDate, holidayDates })` yields one session a week on the group's weekday inside the program's `CourseSeason` `[startDate, endDate]` for this `(schoolYear, city)`. Holiday weeks are dropped outright — **no session-count target, no make-up** — and an unplanned season (or missing weekday) yields `[]`. Flat list, like radionice.

- **Probni sat** (STANDARD only) — `computeTrialSession` yields the single occurrence of the group's weekday inside that year's `TrialWeek`. Not a fourth per-kind derivation but an **extra date prepended to the standard branch**: one free trial session before module 1, which keeps its full seven.

> A holiday is pre-filtered out of the expected set so attendance never shows a slot for it. Any further cancellation (snow day, ad-hoc) is the teacher's call — they leave the row unmarked or write a note.

Since 2026-07 there are **two** record tables sharing that derived session date: `Attendance`, keyed `(enrollmentId, sessionDate)`, for students; and `TeacherAttendance`, keyed `(userId, scheduledGroupId, sessionDate)`, for teaching hours. Both are written by the same `bulkMarkSession` transaction. `TeacherAttendance` is keyed on the **group**, not on `TeacherAssignment`, so the rows outlive an unassignment — they are the sole source of **hours** for the payout report (`getTeacherWorkReport` → `src/lib/teacher-work-report.ts`, each present row worth the group's `endTime − startTime`), which prices those hours at the teacher's current `User.hourlyRateCents` — a null rate makes every amount null rather than 0, and there is deliberately no six-month total. Marking a date as a holiday after the fact deletes **both** tables' rows for that date, city-filtered, so a cancelled class is never still billed.

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
    H --> T{"resolveTrialDateForGroup(group) → a trial date?"}
    T -->|Yes| TS["sections.unshift('Probni sat'): moduleScheduleId null,<br/>one expectedSession, the WHOLE roster listed"]
    T -->|No| I
    TS --> I
    I["Record-only dates not in any section → assignAdhocDateToSection: matching module's adhocSessions, else 'Ostali termini' (otherDates)"]

    style TS fill:#fef3c7
    style G fill:#fee2e2
    style H fill:#d1fae5
    style E fill:#e0f2fe
```

> **The trial section is unshifted BEFORE the ad-hoc bucketing, on purpose.** With no section owning the date, a marked probni sat would fall into "Ostali termini". `moduleScheduleId` is null (there is no `ModuleEnrollment` to bill it against) and the whole roster is listed, because the trial predates any per-module enrollment. Marking it writes ordinary `Attendance` **and** `TeacherAttendance` rows — the trial is free for the child but a paid hour for the teacher, so it appears in Evidencija rada like any other date. Source: `resolveTrialDateForGroup` (`src/lib/trial-week.ts`) → `computeTrialSession` (`src/lib/session-dates.ts`), keyed on the **group's own** `schoolYear`; an absent `TrialWeek` row is the "no probni sat this year" state, and a holiday on the group's weekday **removes** that group's trial rather than moving it.

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

## Natjecateljski program — `computeSeasonSessions`

```mermaid
flowchart TD
    A["Input: dayOfWeek + CourseSeason startDate/endDate + holidayDates set"] --> B{"Weekday parseable AND both season dates set?"}
    B -->|No| EMPTY["Return empty list — season unplanned"]
    B -->|Yes| C["Advance to first weekday occurrence on/after startDate, step +7 days until past endDate"]
    C --> D{"Date in holidayDates set?"}
    D -->|Yes| SKIP["Skip — holiday week dropped outright, no make-up"]
    D -->|No| KEEP[Add to session list]

    style EMPTY fill:#fee2e2
    style SKIP fill:#fef3c7
    style KEEP fill:#d1fae5
    style D fill:#e0f2fe
```

> Source: `computeSeasonSessions()` in `src/lib/session-dates.ts` — a thin wrapper that hands `computeExpectedSessions` the season as its single window. There is **no session-count target**: two groups on different weekdays legitimately finish the season with different totals, because the competitive track is paced by the calendar, not by a fixed curriculum length. The season row comes from `CourseSeason` keyed `(courseId, schoolYear, city)`.

## Which branch a group takes — `getGroupAttendance`

```mermaid
flowchart TD
    A["getGroupAttendance(groupId)"] --> B["assertTeacherOwnsGroup, then load group + holidays + roster + records + teacher hours + markingWindow"]
    B --> C{group.course.kind}
    C -->|"RADIONICA (isRadionica)"| R["buildFlatAttendance(base, 'custom', computeRadionicaSessions(dateStart, dateEnd, holidays))"]
    C -->|"COMPETITION (isCompetition)"| S["season = course.seasons row for this (schoolYear, city)<br/>buildFlatAttendance(base, 'season', computeSeasonSessions(dayOfWeek, season dates, holidays))"]
    C -->|STANDARD| ST["buildStandardAttendance — race-ahead arc sliced into per-module sections"]

    style R fill:#fef3c7
    style S fill:#fef3c7
    style ST fill:#dbeafe
```

> The return type is a union on `kind`: the two flat branches share one shape — `{ kind: 'custom' | 'season', expectedSessions[], extraSessions[] }` (`'custom'` = radionica, `'season'` = competition) — while standard returns `{ kind: 'standard', sections[], otherDates[], defaultSelectedDate }`. On the client, `AttendanceMarker` routes `kind === 'standard'` to `StandardAttendanceMarker` and both flat kinds to one `FlatAttendanceMarker`, whose default date comes from `pickFlatDefault` (today if expected, else nearest past, else first). The header line is `scheduleHint(dateRange = kind === 'custom', …)` — a radionica reads as its date range, while a competition group reads as its weekday, exactly like a standard group.

## Extra / ad-hoc sessions

A recorded Attendance date that isn't an expected session is surfaced, never dropped.

```mermaid
flowchart LR
    A["For each Attendance record, key = YYYY-MM-DD"] --> B{"Key in an expected-session set?"}
    B -->|Yes| NORMAL[Normal session]
    B -->|No - standard| ADHOC["Bucket into the matching module's adhocSessions, else 'Ostali termini' (otherDates)"]
    B -->|No - radionica or competition| EXTRA["extraSessions — makeup or ad-hoc class"]

    style NORMAL fill:#d1fae5
    style ADHOC fill:#fef3c7
    style EXTRA fill:#fef3c7
```

> Extra sessions appear when a teacher records attendance for a date outside the expected set — typically a makeup class, or a session held on what was pre-filtered as a holiday. Standard groups route it to the nearest module section (or "Ostali termini"); the flat kinds (radionica and competition) collect it in `extraSessions`.

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
    Teacher->>UI: (group with 2+ assigned teachers) ticks who actually taught
    Note over UI: A single-teacher group shows no teacher control at all
    Teacher->>UI: Clicks Save

    UI->>Server: bulkMarkSession(groupId, sessionDate, entries[], teacherEntries?[])

    Server->>Server: Zod validation (bulkMarkSessionSchema)
    Server->>Server: assertTeacherOwnsGroup(groupId) — ADMIN pass-through is city-bound (cross-city group 404s)
    Server->>Server: TEACHER only — teacherMarkingError(sessionDate)
    Note right of Server: Outside [1st of current Zagreb month .. today] → reject before the<br/>transaction, nothing written. Admins are unrestricted.

    rect rgb(224, 242, 254)
        Note over Server,DB: $transaction (isolationLevel Serializable)
        Server->>DB: Fetch group.schoolYear
        Server->>DB: Verify all enrollmentIds belong to this group + schoolYear
        Note right of Server: If count mismatch → throw ENROLLMENT_MISMATCH (rolls back transaction)
        Server->>DB: Upsert Attendance for each entry
        Note right of DB: Upsert key: (enrollmentId, sessionDate). Sets present, note, recordedById.
        Server->>DB: Fetch TeacherAssignment userIds for this group
        Server->>Server: resolveTeacherEntries(teacherEntries, assignedUserIds)
        Note right of Server: Drops entries for non-assigned users.<br/>Single-teacher group with no entry → auto { present: true }.
        Server->>DB: Upsert TeacherAttendance for each resolved entry
        Note right of DB: Upsert key: (userId, scheduledGroupId, sessionDate). Sets present, recordedById.
    end

    Server-->>UI: Success
    UI->>UI: Toast confirmation
    Server->>Server: revalidatePath for teacher group + admin student pages
```

> Source: `bulkMarkSession()` in `src/actions/teacher/attendance.ts`. The upsert means re-saving the same date updates existing records rather than creating duplicates.

## Teaching hours — which rows get written

```mermaid
flowchart TD
    A["bulkMarkSession input.teacherEntries (optional)"] --> B["assigned = TeacherAssignment userIds for this group"]
    B --> C["entries = provided.filter(e => assigned.has(e.userId))"]
    C --> H["Entries for non-assigned users are DROPPED — a stand-in must be assigned to the group first"]
    C --> D{"assigned.length === 1 AND that teacher not already covered?"}
    D -->|Yes| E["Auto-add { userId: assigned[0], present: true }"]
    D -->|No| F["Use the filtered entries as-is"]
    E --> G["Upsert TeacherAttendance (userId, scheduledGroupId, sessionDate)"]
    F --> G

    style E fill:#d1fae5
    style H fill:#fee2e2
    style G fill:#e0f2fe
```

> Source: `resolveTeacherEntries()` in `src/actions/teacher/attendance.ts`. Explicit entries win; a one-teacher group needs no interaction — marking the students books that teacher's hour. Nothing is ever booked for someone not assigned to the group, so a tampered payload cannot invent payable hours. Re-saving the same date updates rather than duplicates, exactly like the student upsert.

## The teacher marking window

Hours are money, so a **TEACHER** may only record the current calendar month, up to and including today — no marking a class that hasn't happened, and no filling in a whole month after the fact. The window is anchored on the Europe/Zagreb date (`teacherMarkingWindow` in `src/lib/attendance-window.ts`), matching how `recentMonthWindows` computes the report, so the 1st never flips a couple of hours early on a UTC server.

| Selected date | TEACHER | ADMIN |
|---|---|---|
| Today, or earlier this month | markable | markable |
| Tomorrow / later | rejected — *"Ne možete evidentirati dolazak za budući termin."* | markable |
| Any earlier month | rejected — *"Možete evidentirati samo termine tekućeg mjeseca…"* | markable |

**Admins are deliberately unrestricted** — the correction path is `bulkMarkSession` itself: the `teacherMarkingError` check runs only for `role === 'TEACHER'`, so an admin marking through the same Dolazak tab can record any date and a genuinely missed Friday never becomes permanently unrecordable. (`src/actions/admin/attendance.ts` only exposes the read side, `getStudentAttendance`, for the admin student page.) `getGroupAttendance` returns `markingWindow` (null for admins) so the UI degrades honestly: out-of-window dates stay clickable for viewing, but the Save button is replaced by the reason and the roster goes read-only. Past sessions remain visible; only writing is gated.

## Retroactive holidays

Marking a date as a holiday *after* attendance exists deletes both record tables for that date, inside one transaction and filtered by `(schoolYear, city)`:

```mermaid
flowchart LR
    A["Admin marks date(s) as holiday"] --> B{Existing records?}
    B -->|No| SAVE["Upsert SchoolYearHoliday rows"]
    B -->|Yes| WARN["requiresConfirmation + count of BOTH student and teacher rows"]
    WARN --> C{Admin confirms?}
    C -->|No| STOP["Nothing written"]
    C -->|Yes| DEL["deleteMany Attendance (via enrollment.scheduledGroup)<br/>deleteMany TeacherAttendance (via scheduledGroup)"]
    DEL --> SAVE

    style DEL fill:#fee2e2
    style SAVE fill:#d1fae5
```

> Source: `src/actions/admin/holidays.ts` (`upsertHolidayRange` and `bulkImportHolidays` share the same scoped helper). The city filter is load-bearing — this delete is irreversible, and a Šibenik closure must never destroy Split rows. Deleting the teacher rows too is what stops a cancelled class from still being billed.

## Default Session Selection (standard groups)

`pickDefaultSelectedDate` picks the most relevant date from the arc state — standard branch only; the flat branches (radionica and competition) return no `defaultSelectedDate`, and `FlatAttendanceMarker` picks its own client-side via `pickFlatDefault`.

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
