# Business Rules — Flowcharts

## 1. Spot Reservation and Availability

Spot math differs between standard courses (module-scoped) and radionice (group-scoped). Both share the same "preferred inquiry" offset.

### Standard course (module-scoped)

```mermaid
flowchart TD
    A[getActivePrograms called] --> B[For each ScheduledGroup with an active enrollment window]
    B --> C["enrollingSchedule = first CourseModule (by sortOrder) whose ModuleSchedule for THIS group's schoolYear has startDate > now"]
    C --> D{enrollingSchedule exists?}
    D -->|No| HIDE[Group hidden from /upisi]
    D -->|Yes| E["enrolledCount = count enrollments whose moduleEnrollments include enrollingSchedule"]
    E --> F[preferredCount = inquiries where status NOT IN DECLINED, ACCOUNT_CREATED]
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
    A[getActivePrograms called] --> B[For each ScheduledGroup with an active enrollment window]
    B --> C[enrolledCount = all enrollments in group, presence only]
    C --> D[preferredCount = inquiries where status NOT IN DECLINED, ACCOUNT_CREATED]
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
        F1[updateInquiryStatus to DECLINED]
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

> Note: When an inquiry transitions to ACCOUNT_CREATED, it stops counting as a preferred inquiry (filter excludes both DECLINED and ACCOUNT_CREATED). The new enrollment takes over the slot, so the net count stays the same.
>
> Note: `closeModuleSchedule` doesn't delete any `ModuleEnrollment` rows — it just moves `ModuleSchedule.endDate` to now. The "enrolling module" logic advances to the next module (by sortOrder) whose `startDate` is still in the future, so the displayed free-spot count flips to that next module's capacity.

---

## 2. Student Deduplication

```mermaid
flowchart TD
    A[createStudentFromInquiry called] --> B[Extract childFirstName, childLastName, childDateOfBirth from inquiry]
    B --> C{childDateOfBirth available?}
    C -->|No DOB| NEW[Create new student]
    C -->|Has DOB| D{Find User where role = STUDENT and firstName + lastName case-insensitive and dateOfBirth matches?}
    D -->|Found| REUSE[Reuse existing student]
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
    M --> N2[Create Enrollment status ACTIVE]
    N --> O{Enrollment already exists?}
    O -->|Yes| P[Skip enrollment creation]
    O -->|No| N2

    style NEW fill:#e0f2fe
    style REUSE fill:#fef3c7
    style M fill:#d1fae5
```

---

## 3. Grade-to-Level Mapping and Group Filtering

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

    C --> G[Filter programs where level = SLR_1]
    D --> G2[Filter programs where level = SLR_2]
    E --> G3[Filter programs where level = SLR_3]
    F --> G4[Filter programs where level = SLR_4]

    G --> H[Show available groups for matched courses]
    G2 --> H
    G3 --> H
    G4 --> H

    H --> I["Exclude radionice: isCustom courses filtered out from standard /upisi form"]

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

### Workshop - Radionica Form

```mermaid
flowchart TD
    A["Parent visits /programi/slug/prijava"] --> B[preselectedCourseId passed to InquiryForm]
    B --> C["Grade set to 'workshop' in defaultValues"]
    C --> D[Grade dropdown hidden in Step 3]
    D --> E[Only show groups for preselected course]
    E --> F[No grade-to-level filtering applied]
    F --> G[Group dropdown shows flat list not optgroups]

    style C fill:#fef3c7
    style D fill:#fef3c7
```

---

## 4. Enrollment Window Logic

```mermaid
flowchart TD
    A[getActivePrograms queries ScheduledGroups] --> B{enrollmentStart set AND enrollmentStart <= now?}
    B -->|No| EXCLUDE[Excluded - window not yet open or never set]
    B -->|Yes| C{enrollmentEnd IS NULL OR enrollmentEnd >= now?}

    C -->|No| EXCLUDE
    C -->|Yes| D{course.isCustom?}

    D -->|Yes - radionica| INCLUDE[Group included in results]
    D -->|No - standard| E{Next-starting ModuleSchedule for group.schoolYear exists?}

    E -->|Yes| INCLUDE
    E -->|No| EXCLUDE2[Excluded - no upcoming module to enroll into]

    INCLUDE --> I[Group shown in public form dropdown]

    style EXCLUDE fill:#fee2e2
    style EXCLUDE2 fill:#fee2e2
    style INCLUDE fill:#d1fae5
```

> Note: Groups with **both** `enrollmentStart` and `enrollmentEnd` null are hidden. Every publicly listable group must have an explicit start. There is no "always open" shortcut anymore.
>
> Note: `ScheduledGroup.schoolYear` is **not** part of the visibility check. Admins control public visibility purely via the enrollment window; the school-year field is retained only for historization (which cohort a given `ModuleSchedule` / `ModuleEnrollment` / `StudentComment` belongs to).
>
> Note: The second gate (next-starting module) is what keeps a standard group from appearing mid-year once all its modules have already started. To re-open the group, an admin closes the running module via `closeModuleSchedule` (sets `endDate = now`), which makes the next module's `startDate > now` check pass again.

---

## 5. sendScheduleOptions Flow

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

> Note: sendScheduleOptions is a pure email action — no database writes. It can be called multiple times. The inquiry's preferred group from the original submission is preserved and preselected when creating an account.

---

## 6. Material Scope — Visibility Resolution

Materials use a three-scope model (`MaterialScope`: MODULE, COURSE, GROUP). The effective set for a student viewing a group combines all applicable scopes, minus per-group hide overrides.

### Student material resolution

```mermaid
flowchart TD
    A[Student views materials for a ScheduledGroup] --> B[Collect union of three scope branches]

    B --> C1["GROUP scope: scheduledGroupId = thisGroup"]
    B --> C2{"course.isCustom?"}
    B --> C3{"moduleIds.length > 0?"}

    C2 -->|Yes - radionica| D1["COURSE scope: courseId = course.id"]
    C2 -->|No - standard| SKIP1[COURSE branch skipped]
    C3 -->|Yes - standard| D2["MODULE scope: moduleId IN course.moduleIds"]
    C3 -->|No - radionica| SKIP2[MODULE branch skipped]

    C1 --> UNION[OR union of matched branches]
    D1 --> UNION
    D2 --> UNION
    SKIP1 --> UNION
    SKIP2 --> UNION

    UNION --> E["Subtract: MaterialGroupHide rows where scheduledGroupId = thisGroup"]
    E --> F[Effective material set]

    F --> G1["moduleSections: grouped by moduleId, for MODULE-scoped"]
    F --> G2["groupMaterials: flat list, for GROUP + COURSE-scoped"]

    style C1 fill:#dbeafe
    style D1 fill:#e0e7ff
    style D2 fill:#ede9fe
    style E fill:#fee2e2
    style F fill:#d1fae5
```

> Note: Staff (teacher/admin) see hidden materials rendered as dimmed with a toggle to unhide. Students never see hidden materials — the `NOT { hiddenInGroups }` filter runs server-side.

### Scope validation on create

```mermaid
flowchart TD
    A[Create or edit material] --> B{scope?}

    B -->|MODULE| C1[moduleId required]
    C1 --> C2{course.isCustom?}
    C2 -->|Yes| ERR1[Error: MODULE scope not allowed on radionice]
    C2 -->|No| OK1[Valid]

    B -->|COURSE| D1[courseId required]
    D1 --> D2{course.isCustom?}
    D2 -->|No| ERR2[Error: COURSE scope only for radionice]
    D2 -->|Yes| OK2[Valid]

    B -->|GROUP| E1[scheduledGroupId required]
    E1 --> OK3[Valid - no course-type constraint]

    style ERR1 fill:#fee2e2
    style ERR2 fill:#fee2e2
    style OK1 fill:#d1fae5
    style OK2 fill:#d1fae5
    style OK3 fill:#d1fae5
```

> Note: Scope validation lives in `validateScopeConsistency()` in `src/actions/material/crud.ts`. The rule is: MODULE is for standard programs only, COURSE is for radionice only, GROUP works on any course type.
