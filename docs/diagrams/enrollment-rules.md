# Enrollment Rules

Business rules for the inquiry → account-creation pipeline, spot reservation, and inquiry state transitions.

**City tenancy:** the public `/upisi` form opens with a **mandatory city dropdown** (Split/Šibenik, no default) as Step 1's first field; the whole pipeline below runs inside that one city. `submitInquiry` server-verifies `chosenGroup.city === submitted city` and persists `Inquiry.city`; the party form has no dropdown — `submitPartyInquiry` stamps `SPLIT` (proslave are Split-only at launch). Admin review, group pickers and account creation are scoped to the admin's session city; `createStudentFromInquiry` additionally asserts `group.city === inquiry.city` inside the transaction, and a returning-student identity match in the *other* city blocks the accept flow with an escalation message (never auto-reuses the account).

---

## 1. Inquiry State Machine

Only `Inquiry` has a real state machine. `Enrollment` and `ModuleEnrollment` are presence rows — see §6.

```mermaid
stateDiagram-v2
    [*] --> NEW_COURSE: Parent submits course inquiry (/upisi)
    [*] --> NEW_PARTY: Parent submits party inquiry (/proslave)

    NEW_COURSE --> ACCOUNT_CREATED: Admin creates student account
    NEW_COURSE --> DECLINED: Admin declines

    NEW_PARTY --> PARTY_SCHEDULED: Admin books party date + time
    NEW_PARTY --> DECLINED: Admin declines

    PARTY_SCHEDULED --> DECLINED: Admin changes mind

    ACCOUNT_CREATED --> [*]
    DECLINED --> [*]
    PARTY_SCHEDULED --> [*]

    note right of NEW_COURSE
        type = COURSE
        city = parent's Step-1 choice (group.city verified against it)
        consentGivenAt set to now
        Email: InquiryConfirmationEmail to parent
        Spot reserved if scheduledGroupId provided
        Admin can send schedule-options email without changing status
    end note

    note right of NEW_PARTY
        type = PARTY
        city = SPLIT stamped server-side (proslave are Split-only)
        partyProposedDate from form (optional)
        Email: PartyInquiryConfirmationEmail to parent
        No spot reservation (not a group enrollment)
    end note

    note left of ACCOUNT_CREATED
        Guard: status not ACCOUNT_CREATED or DECLINED
        User created or reused via DOB dedup
        Parent contact data + GDPR consent copied to User
        Enrollment row created (no status column)
        ModuleEnrollment rows created for standard courses
        EnrollmentMonth rows (join month → season end) for the
        Natjecateljski program instead — it is billed monthly
        Inquiry.studentId + assignedGroupId set
        Email: AccountCredentialsEmail to parent
        TERMINAL STATE (COURSE only)
    end note

    note left of PARTY_SCHEDULED
        Guard: inquiry.type must be PARTY
        partyConfirmedDate + partyStartTime set
        schoolYear left unchanged (stays in admin Upiti list)
        Kalendar finds party by confirmed date NOT schoolYear
        No email sent (owner's explicit choice)
    end note

    note left of DECLINED
        declineReason captured on Inquiry row
        Spot freed from preferredInquiries count (COURSE)
        No automated email
        TERMINAL STATE
    end note
```

### Transition table

| From | To | Action | Guard | Side effects |
|------|-----|--------|-------|-------------|
| — | `NEW` | `submitInquiry` / `submitPartyInquiry` | Zod validation; COURSE: `group.city === submitted city`; COURSE **without** `scheduledGroupId`: `!isTerminRequired(programs, grade, courseId)` | Inquiry created with `city`; confirmation email; spot reserved if group selected (COURSE) |
| `NEW` | `ACCOUNT_CREATED` | `createStudentFromInquiry` | `status !== ACCOUNT_CREATED && status !== DECLINED`; `type === COURSE` | User + Enrollment + ModuleEnrollments; credentials email; `studentId` + `assignedGroupId` set |
| `NEW` | `PARTY_SCHEDULED` | `schedulePartyInquiry` | `type === PARTY` | `partyConfirmedDate` + `partyStartTime` set; appears on Kalendar |
| `NEW` | `DECLINED` | `declineInquiry` | Zod (reason min 3 trimmed, max 2000) | `declineReason` persisted; spot freed |
| `PARTY_SCHEDULED` | `DECLINED` | `declineInquiry` | — (no status guard on decline) | `declineReason` persisted |

### Non-status actions

| Action | When | Side effects |
|--------|------|-------------|
| `sendScheduleOptions` | Status `NEW` only | Fetches selected groups + sends schedule email. No DB writes, status stays `NEW`. Can be called multiple times. |

### Deletion

- `deleteInquiry` has no status guard — can delete at any status.
- Does NOT cascade to `User` or `Enrollment` if already created.

---

## 2. Spot Reservation and Availability

Spot math differs between standard courses (module-scoped) and radionice (group-scoped).

### Standard course (module-scoped)

```mermaid
flowchart TD
    A["getActivePrograms(city) called"] --> A2["Resolve OPEN windows first: CourseEnrollmentWindow rows for THIS city where enrollmentStart &lt;= now &lt;= enrollmentEnd → Set of (courseId, schoolYear, city) keys"]
    A2 --> B["For each ScheduledGroup of this city whose own (courseId, schoolYear, city) is in the open-window Set"]
    B --> C["nextEnrollingModule = getGroupModuleArc(dayOfWeek, modules + this city's ModuleSchedule rows, this city's holidays) race-ahead → first arc module whose firstSession &gt; now"]
    C --> D{nextEnrollingModule exists?}
    D -->|No| HIDE[Group hidden from /upisi - graduated past M4 or schedule incomplete]
    D -->|Yes| E["enrolledCount = enrollments whose moduleEnrollments include nextEnrollingModule.moduleScheduleId"]
    E --> F[preferredCount = inquiries where status = NEW]
    F --> G["available = maxStudents - enrolledCount - preferredCount"]
    G --> H{available > 0?}
    H -->|Yes| SHOW[Group shown with 'next module' label]
    H -->|No| FULL[Group shown as full]

    style HIDE fill:#fee2e2
    style SHOW fill:#d1fae5
    style FULL fill:#fee2e2
    style G fill:#e0f2fe
```

### Radionica (group-scoped, `course.isCustom`)

```mermaid
flowchart TD
    A["getActivePrograms(city) called"] --> A2["Resolve OPEN windows first: CourseEnrollmentWindow rows for THIS city where enrollmentStart &lt;= now &lt;= enrollmentEnd → Set of (courseId, schoolYear, city) keys"]
    A2 --> B["For each ScheduledGroup of this city whose own (courseId, schoolYear, city) is in the open-window Set"]
    B --> C[enrolledCount = all enrollments in group, presence only]
    C --> D[preferredCount = inquiries where status = NEW]
    D --> E["available = maxStudents - enrolledCount - preferredCount"]
    E --> F{available > 0?}
    F -->|Yes| SHOW[Group shown as available]
    F -->|No| FULL[Group shown as full]

    style SHOW fill:#d1fae5
    style FULL fill:#fee2e2
    style E fill:#e0f2fe
```

### When spots change

```mermaid
flowchart LR
    subgraph "Count increases - spot reserved"
        R1[submitInquiry with scheduledGroupId]
        R2[createStudentFromInquiry]
        R3[createStudentManually with group + modules]
        R4[addEnrollment on existing student]
        R5[addModuleEnrollment - standard course only]
        R1_TX["$transaction Serializable<br/>P2034 retried once<br/>second P2034 returns 'Pokusajte ponovno.'<br/>GroupFullError returns GROUP_FULL"]
        R1 -.-> R1_TX
    end

    subgraph "Count decreases - spot freed"
        F1[declineInquiry with reason]
        F2[deleteInquiry]
        F3[deleteEnrollment - hard delete row]
        F4[deleteModuleEnrollment - hard delete row]
        F5["closeModuleSchedule - endDate set to now, next module takes over"]
    end

    style R1 fill:#fee2e2
    style R2 fill:#fee2e2
    style R3 fill:#fee2e2
    style R4 fill:#fee2e2
    style R5 fill:#fee2e2
    style R1_TX fill:#fef3c7
    style F1 fill:#d1fae5
    style F2 fill:#d1fae5
    style F3 fill:#d1fae5
    style F4 fill:#d1fae5
    style F5 fill:#d1fae5
```

> The preferred-inquiry count is `status === NEW` only. When an inquiry transitions to `ACCOUNT_CREATED` (or `DECLINED`) it stops counting as a preferred inquiry; the new enrollment takes over the slot so the net count stays the same.

### Capacity guard pattern (write path)

Every action that can take a spot routes through the shared guard in `src/lib/group-capacity.ts`. The guard runs the mutation inside a `Serializable` transaction, re-checks capacity from inside that same snapshot, and throws `GroupFullError` rather than over-booking.

```mermaid
flowchart TD
    A["Enrollment write actions:<br/>submitInquiry · createStudentFromInquiry ·<br/>createStudentManually · addEnrollment"] --> B["runWithGroupCapacityGuard(fn)<br/>db.$transaction(fn, isolationLevel: Serializable)"]

    B --> C["assertGroupHasAvailableSpot(tx, groupId)<br/>loads group + holidays inside the tx"]
    C --> D["computeGroupCapacity<br/>standard: enrollments on the per-group<br/>next-enrolling module (weekday + holiday arc)<br/>radionica: enrollments.length"]
    D --> E{"Spot free?<br/>enrolled + reservedInquiries(NEW) &lt; maxStudents"}

    E -->|Yes| F["Run the mutation, commit, return result"]
    E -->|No| G["throw GroupFullError"]

    B -.->|P2034 serialization conflict| H{"Which attempt?"}
    H -->|First| I["Re-run the whole tx once"]
    I --> B
    H -->|Second| K["Rethrow P2034"]

    G --> FULL["Caller catches GroupFullError →<br/>public form: code GROUP_FULL + fresh programs payload<br/>admin dialogs: code GROUP_FULL + 'Grupa je u međuvremenu popunjena.'"]
    K --> RETRY["Caller returns 'Pokušajte ponovno.'"]

    style F fill:#d1fae5
    style E fill:#e0f2fe
    style G fill:#fee2e2
    style FULL fill:#fee2e2
    style K fill:#fee2e2
    style RETRY fill:#fef3c7
```

> `GroupFullError` is a domain signal, **not** a serialization failure — it propagates straight to the caller and is never retried. Only Prisma `P2034` (Serializable write-write conflict) triggers the single re-run; a second `P2034` is rethrown for the caller to surface as a generic retry message.

### Termin is conditionally mandatory (pre-transaction gate)

```mermaid
flowchart TD
    A["submitInquiry(data) — Zod passed"] --> B{scheduledGroupId provided?}
    B -->|Yes| TX["Capacity guard transaction (above)"]
    B -->|No| C["programs = getActivePrograms(city)"]
    C --> D["programsForSelection(programs, grade, courseId)<br/>radionica flow → only that course<br/>standard flow → radionice excluded, grade → SLR level"]
    D --> E{"Selection chosen?<br/>grade OR preselected course"}
    E -->|No| TX
    E -->|Yes| F{"hasOpenTermin — any matching group with isFull = false?"}
    F -->|No| TX
    F -->|Yes| ERR["Reject: code TERMIN_REQUIRED<br/>'Za odabrani razred dostupni su termini – odaberite jedan.'<br/>+ fresh programs payload, no Inquiry row written"]

    style ERR fill:#fee2e2
    style TX fill:#d1fae5
    style F fill:#e0f2fe
```

> Source: `isTerminRequired` / `programsForSelection` / `hasOpenTermin` in `src/lib/inquiry-availability.ts`, called from `submitInquiry` **before** `runWithGroupCapacityGuard`. It is the server mirror of the client's conditional requirement, so a stale or tampered payload can't skip the choice. When no enrolment window is open, or every matching group is full, the termin stays **optional** — a general "leave your details" inquiry still goes through. `courseId` is only sent in the radionica/preselected flow, so it maps to the same `preselectedCourseId` argument the client uses.
>
> The public result union therefore carries **two** codes — `code: 'GROUP_FULL' | 'TERMIN_REQUIRED'` — and both ship a fresh `programs[]` so the form re-renders live availability rather than acting on the stale list the visitor submitted against.

---

## 3. Student Deduplication

```mermaid
flowchart TD
    A[createStudentFromInquiry called] --> B[Extract childFirstName, childLastName, childDateOfBirth from inquiry]
    B --> C{childDateOfBirth available?}
    C -->|No DOB| NEW[Create new student]
    C -->|Has DOB| D{Find User where role = STUDENT and firstName + lastName case-insensitive and dateOfBirth matches? GLOBAL - both cities}
    D -->|Found in the SAME city| REUSE[Reuse existing student]
    D -->|Found in the OTHER city| BLOCK["CrossCityStudentError - accept flow blocked with escalation message; the other city's account and credentials are never surfaced"]
    D -->|Not found| NEW

    NEW --> G[generateUsername: strip diacritics lowercase]
    G --> H{Username taken in DB?}
    H -->|No| I[Use username as-is]
    H -->|Yes| J[Append numeric suffix e.g. imeprezime2]
    I --> K[generateSimplePassword 6 chars]
    J --> K
    K --> L[hashPassword bcrypt 12 rounds]
    L --> M["Create User: role STUDENT, dateOfBirth set, email username@student.inovatic.local, store plainPassword"]

    REUSE --> N[Check existing Enrollment for userId + groupId + schoolYear]
    M --> N2[Create Enrollment]
    N --> O{Enrollment already exists?}
    O -->|Yes| P[Skip enrollment creation]
    O -->|No| N2

    style NEW fill:#e0f2fe
    style REUSE fill:#fef3c7
    style BLOCK fill:#fee2e2
    style M fill:#d1fae5
```

---

## 4. Grade-to-Level Mapping and Group Filtering

> Step 3 renders only the **Step-1 city's** programs/groups (`programsByCity` payload; changing the city clears any stale course/group selection). Grade filtering below then applies within that city.
>
> The mapping is a single source of truth: `GRADE_TO_LEVEL` in `src/lib/inquiry-availability.ts`, shared by the client dropdown filter and the server-side `TERMIN_REQUIRED` gate in §2 — so the two can't drift apart.

```mermaid
flowchart TD
    A[Parent selects grade in Step 3 dropdown] --> B{Grade value}

    B -->|predskolci| C[SLR_1]
    B -->|1. razred| C
    B -->|2. razred| C
    B -->|3. razred| D[SLR_2]
    B -->|4. razred| D
    B -->|5. razred| E[SLR_3]
    B -->|6. razred| E
    B -->|7. razred| F[SLR_4]
    B -->|8. razred| F
    B -->|"Srednja škola 1–4 (ss1–ss4)"| SS[No SLR level]

    SS --> SSX["No match — never offered on the public /upisi form"]

    C --> G[Filter programs where level = SLR_1]
    D --> G2[Filter programs where level = SLR_2]
    E --> G3[Filter programs where level = SLR_3]
    F --> G4[Filter programs where level = SLR_4]

    G --> H[Show available groups for matched courses]
    G2 --> H
    G3 --> H
    G4 --> H

    H --> I["Exclude everything without dated modules: radionice enrol via /radionice/slug, the Natjecateljski program only via its invitation link"]

    style C fill:#dbeafe
    style D fill:#e0e7ff
    style E fill:#ede9fe
    style F fill:#f3e8ff
```

### Grade changes reset group selection

```mermaid
flowchart TD
    A[Parent changes grade dropdown] --> B[Reset selectedGroupKey to empty]
    B --> C[Clear scheduledGroupId via setValue]
    C --> D[Reset courseId to preselectedCourseId or undefined]
    D --> E[Re-filter programs by new grade level]
    E --> F[Re-render group dropdown with filtered options]
```

### Workshop / Radionica form

```mermaid
flowchart TD
    A["Parent visits /radionice/slug"] --> B[preselectedCourseId + preselectedCity passed to InquiryForm]
    B --> C[City dropdown hidden in Step 1]
    C --> D[Only show groups for preselected course]
    D --> E[No grade-to-level filtering applied]
    E --> F[Group dropdown shows flat list not optgroups]
```

### Per-program signup link (`/upisi/<slug>`)

The link you send when the program is already decided — a returning student
moving up a level, or a competitor invited into the Natjecateljski program. It
deliberately **bypasses §4's grade→level rule**: last year's SLR 1 group moves
on to SLR 2 whatever their razred says. `/upisi` itself is unchanged.

```mermaid
flowchart TD
    A["Parent opens /upisi/<slug> from an invitation e-mail"] --> B[preselectedCourseId passed to InquiryForm]
    B --> C{Program city}
    C -->|"shared (SLR, natjecateljski)"| C1[Parent picks Split/Šibenik in Step 1]
    C -->|per-city| C2[City fixed, dropdown hidden]
    C1 --> D[Step 3 offers ONLY this program's groups in that city]
    C2 --> D
    D --> E["programsForSelection short-circuits on preselectedCourseId → grade filters nothing"]
    E --> F{Program kind}
    F -->|COMPETITION| G["Razred dropdown adds Srednja škola 1–4"]
    F -->|STANDARD| H[Razred dropdown stops at 8. razred]
    G --> I[Submit]
    H --> I
    I --> J["submitInquiry re-checks: a high-school grade is refused unless the resolved course is COMPETITION"]
    J --> K[Ordinary NEW inquiry → admin review → account]

    style G fill:#fef3c7
    style J fill:#fee2e2
```

---

## 5. Enrollment Window Logic

The signup window lives on `CourseEnrollmentWindow(courseId, schoolYear, city)` — one row per program per school year **per city** (each city opens the shared program independently), inherited by every group of that program/year/city.

```mermaid
flowchart TD
    A["getActivePrograms(city)"] --> B["Load OPEN windows for THIS city: CourseEnrollmentWindow where city = caller city AND enrollmentStart &lt;= now AND enrollmentEnd &gt;= now"]
    B --> B0{Any open window?}
    B0 -->|No| EMPTY[Return empty - nothing enrollable]
    B0 -->|Yes| B1["openKeys = Set of (courseId, schoolYear, city); fetch this city's groups for those courseIds"]
    B1 --> C{"Group's own (courseId, schoolYear, city) in openKeys?"}
    C -->|No| EXCLUDE[Excluded - program has no open window for THIS group's year]
    C -->|Yes| D{course.isCustom?}

    D -->|Yes - radionica| INCLUDE[Group included in results]
    D -->|No - standard| E{"nextEnrollingModule from getGroupModuleArc exists?"}

    E -->|Yes| INCLUDE
    E -->|No| EXCLUDE2[Excluded - graduated past M4 or schedule incomplete]

    INCLUDE --> I[Group shown in public form dropdown]

    style EMPTY fill:#fee2e2
    style EXCLUDE fill:#fee2e2
    style EXCLUDE2 fill:#fee2e2
    style INCLUDE fill:#d1fae5
```

> A window counts as open only when **both** `enrollmentStart` and `enrollmentEnd` are set and `now` falls inside the range. No `CourseEnrollmentWindow` row for a `(course, year, city)` — or one outside the range — hides every group of that program/year in that city; a Split window never exposes Šibenik groups or vice versa. There is no "always open" shortcut.
>
> The standard-course second gate is the per-group race-ahead arc (`getGroupModuleArc` → next-enrolling module), not a raw `ModuleSchedule.startDate > now` check. Closing the running module early (`closeModuleSchedule` sets `endDate = today`) reshapes the arc so a later module becomes the next-enrolling one.

---

## 6. sendScheduleOptions Flow

```mermaid
flowchart TD
    A[Admin clicks Send Schedule Options] --> B{inquiry.status === NEW?}
    B -->|No| ERR[Return error: Upit mora biti u statusu Nova]
    B -->|Yes| C[Fetch selected groups with location data]
    C --> D[Send ScheduleOptionsEmail to parent]
    D --> E[Status stays NEW, nothing stored in DB]

    style ERR fill:#fee2e2
    style D fill:#d1fae5
    style E fill:#fef3c7
```

> `sendScheduleOptions` is a pure email action — no database writes. It can be called multiple times. The inquiry's preferred group from the original submission is preserved and preselected when creating an account.

---

## 7. Why there is no Enrollment or ModuleEnrollment state machine

`Enrollment` and `ModuleEnrollment` are presence rows — a student is "in" a group/module iff the row exists. Both models dropped their `status` columns in migration `20260415000000_drop_enrollment_statuses`.

- **`ModuleEnrollment`** — to remove a student from a module, delete the row. Removing module N does **not** cascade to N+1, N+2 — each row is an independent fact.
- **A module is "done"** when `ModuleSchedule.endDate < now`. No per-enrollment status update needed — every `ModuleEnrollment` for that schedule is automatically treated as past once the date is past.
- **`Enrollment`** — a group-membership row per school year. No status, no lifecycle. Deleting it (`onDelete: Cascade`) removes its `ModuleEnrollment` rows.
- **Cancellations are deletes.** For a radionica: `deleteEnrollment`. For a single module in a standard course: `deleteModuleEnrollment`.
- **History is whatever rows still exist.** Past `ModuleEnrollment` rows stay in the DB as the record of what the student participated in. There is no "COMPLETED" status to set.

---

## 8. End-to-End Enrollment Sequence

```mermaid
sequenceDiagram
    actor Parent
    participant Web as Public Site
    participant Server as Server Actions + DB
    participant Email as Resend
    actor Admin

    Note over Parent, Admin: PHASE 1 — Public Inquiry Submission

    Parent->>Web: Visits /upisi or /programi/slug/prijava
    Web->>Server: getActivePrograms()
    Note right of Server: Filters by active enrollment window. For each group computes a per-group race-ahead arc (getGroupModuleArc on dayOfWeek + holidays). Standard groups with no future arc module (graduated past M4) are hidden.
    Server-->>Web: Programs with groups, spots-against-this-group's-next-module, enrollment windows

    Note over Parent, Web: Step 1: parentName, parentEmail, parentPhone
    Note over Parent, Web: Step 2: childFirstName, childLastName, childDateOfBirth, childSchool
    Note over Parent, Web: Step 3: grade, group preference, message, referralSource, GDPR consent

    Parent->>Web: Fills 3-step form and submits
    Web->>Server: submitInquiry(formData)

    Server->>Server: Validate with Zod inquirySchema
    Server->>Server: Create Inquiry type COURSE status NEW consentGivenAt now

    alt scheduledGroupId provided
        rect rgb(255, 243, 199)
            Note over Server: $transaction (isolationLevel Serializable)
            Server->>Server: assertGroupHasAvailableSpot then create Inquiry
            Note right of Server: P2034 serialization failure retried once. Second P2034 returns "Pokusajte ponovno.". GroupFullError returns code GROUP_FULL with fresh programs.
        end
        Server->>Server: Spot reserved via preferredInquiries count
    end

    Server->>Email: Send InquiryConfirmationEmail
    Email-->>Parent: Zaprimili smo vasu prijavu
    Server-->>Web: Success
    Web-->>Parent: Thank you page

    Note over Parent, Admin: PHASE 2 — Admin Reviews Inquiry

    Admin->>Server: Views /admin/upiti inquiry list
    Server-->>Admin: Inquiries with search, status filter, type filter, pagination

    Note over Parent, Admin: OPTIONAL — Admin Sends Schedule Options

    Admin->>Server: Selects groups then sendScheduleOptions inquiryId groupIds
    Server->>Server: Guard: inquiry.status must be NEW
    Server->>Email: Send ScheduleOptionsEmail
    Email-->>Parent: Dostupni termini za childName with group list
    Note right of Admin: Can send multiple times. No DB write.

    Note over Parent, Admin: PHASE 3 — Admin Creates Account and Enrolls

    Admin->>Server: Opens CreateAccountDialog for inquiry
    Server-->>Admin: Course modules and ModuleSchedules for group.schoolYear
    Note right of Admin: Standard courses: admin picks at least one ModuleSchedule. Radionice: step skipped.

    Admin->>Server: createStudentFromInquiry inquiryId groupId moduleScheduleIds
    Server->>Server: Guard: status not ACCOUNT_CREATED or DECLINED

    alt childDateOfBirth available
        Server->>Server: Find existing User where role STUDENT and name + DOB match
    end

    alt New student
        Server->>Server: generateUsername, generateSimplePassword, hashPassword
        Server->>Server: Create User role STUDENT, store plainPassword for admin reference
        Server->>Server: Copy parentName, parentEmail, parentPhone, childSchool, gdprConsentAt from Inquiry
    end

    Server->>Server: Create Enrollment (and ModuleEnrollments for standard courses)
    Server->>Server: Update Inquiry status ACCOUNT_CREATED, studentId, assignedGroupId
    Server->>Email: Send AccountCredentialsEmail
    Email-->>Parent: Pristupni podaci za childName

    Note over Parent, Admin: ALTERNATE ENTRY PATHS

    alt Manual student creation via CreateStudentDialog
        Admin->>Server: getGroupsForCourseInSelectedYear courseId
        Server-->>Admin: Groups for selected school year
        Admin->>Server: createStudentManually firstName lastName dob group moduleScheduleIds
        Server->>Server: Same dedup flow + createStudentCore enrollment path
        Note right of Server: No Inquiry row involved. Admin can pre-enroll into a future-year group.
    end

    alt Add existing student to a new group
        Admin->>Server: Opens student detail then addEnrollment studentId groupId
        Server->>Server: Reuses createStudentCore enrollment path
    end

    Note over Parent, Admin: ALTERNATE EXITS

    alt Admin declines inquiry
        Admin->>Server: declineInquiry id reason
        Server->>Server: Validate reason min 3 trimmed max 2000
        Server->>Server: status DECLINED, declineReason persisted, spot freed
    end

    alt Admin schedules a party inquiry
        Admin->>Server: schedulePartyInquiry id confirmedDate startTime
        Server->>Server: Guard: type must be PARTY
        Server->>Server: status PARTY_SCHEDULED, partyConfirmedDate + partyStartTime set
        Note right of Server: schoolYear left unchanged. Party appears on Kalendar by confirmed date.
    end

    alt Admin removes a module from an enrolled student
        Admin->>Server: deleteModuleEnrollment moduleEnrollmentId
        Server->>Server: Hard delete single row — later modules untouched
    end

    alt Admin closes a running module early
        Admin->>Server: closeModuleSchedule moduleScheduleId
        Server->>Server: Set ModuleSchedule.endDate = now — group advances to next module
    end

    alt Admin removes a whole enrollment
        Admin->>Server: deleteEnrollment enrollmentId
        Server->>Server: Hard delete Enrollment — onDelete Cascade removes ModuleEnrollment rows
    end
```

> The "available spots" number for standard courses comes from the **next-starting** module (first module by `sortOrder` whose arc has a future first session for that group's weekday), not the currently-running module.

---

## 9. What is NOT in this pipeline — `/stem-edukacija`

The B2B institutional inquiry form (`submitStemEducationInquiry`, `src/actions/stem-education.ts`) is **email-only**. It writes nothing to the database — no `Inquiry` row, no status, no state machine, no spot reservation, no `city` stamp. The notification email to the association inbox is the record (owner decision 2026-07-25), which is why it is documented here as an explicit carve-out rather than left for a reader to hunt for.

```mermaid
flowchart LR
    A["Institution submits /stem-edukacija form"] --> H{Honeypot filled?}
    H -->|Yes| SILENT["return success, send nothing"]
    H -->|No| RL{Within rate limit?<br/>5/h per IP, 3/h per e-mail}
    RL -->|No| RLE["error: 'Primili smo previše upita s ove adrese.'"]
    RL -->|Yes| Z["Zod: stemEducationInquirySchema"]
    Z -->|fail| ZE["error: 'Podaci nisu valjani.'"]
    Z -->|pass| N["sendStemEducationInquiryEmail → association inbox"]
    N -->|throws or returns false| NE["error surfaced to the visitor — this is the only copy"]
    N -->|sent| C["sendStemEducationConfirmationEmail → courtesy copy to the institution"]
    C -->|throws| SWALLOW["logged and swallowed — submission still counts as successful"]
    C -->|ok| OK["success"]

    style ZE fill:#fee2e2
    style NE fill:#fee2e2
    style RLE fill:#fee2e2
    style SWALLOW fill:#fef3c7
    style SILENT fill:#fef3c7
    style OK fill:#d1fae5
```

> The asymmetric error handling is deliberate: a failed **notification** loses the inquiry, so the visitor must see it; a failed **confirmation** loses nothing. Note the notification sender returning `false` (meaning `RESEND_API_KEY` is unset) is treated exactly like a throw — otherwise an unset key in production would destroy the inquiry while telling the visitor it arrived.
>
> Because the action is public, unauthenticated and mail-triggering, it is throttled per IP and per submitted address, with a honeypot field that reports success while sending nothing. Sources: `src/lib/rate-limit.ts`, `src/lib/validators/stem-education.ts`.
