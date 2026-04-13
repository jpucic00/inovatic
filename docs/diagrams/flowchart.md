# Business Rules — Flowcharts

## 1. Spot Reservation and Availability

```mermaid
flowchart TD
    A[getActivePrograms called] --> B[For each ScheduledGroup where isActive = true]
    B --> C[Count ACTIVE enrollments]
    B --> D[Count preferredInquiries where status is NEW]
    C --> E["availableSpots = maxStudents - activeEnrollments - nonDeclinedInquiries"]
    D --> E
    E --> F{availableSpots > 0?}
    F -->|Yes| G[Group shown as available in dropdown]
    F -->|No| H[Group shown as full and disabled in dropdown]

    style E fill:#e0f2fe
    style G fill:#d1fae5
    style H fill:#fee2e2
```

### When spots change

```mermaid
flowchart LR
    subgraph "Spot Reserved - count increases"
        R1[Parent submits inquiry with scheduledGroupId]
        R2[Admin creates ACTIVE enrollment via createStudentFromInquiry]
    end

    subgraph "Spot Freed - count decreases"
        F1[Admin declines inquiry - status DECLINED]
        F2[Admin deletes inquiry - record removed]
        F3[Admin toggles enrollment to CANCELLED]
    end

    style R1 fill:#fee2e2
    style R2 fill:#fee2e2
    style F1 fill:#d1fae5
    style F2 fill:#d1fae5
    style F3 fill:#d1fae5
```

> Note: When an inquiry transitions to ACCOUNT_CREATED, it stops counting as a preferredInquiry (filter excludes both DECLINED and ACCOUNT_CREATED). The new active enrollment takes over the slot, so the net spot count stays the same.

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
    A[getActivePrograms queries ScheduledGroups] --> B{Group isActive?}
    B -->|No| EXCLUDE[Excluded from query results]
    B -->|Yes| C{enrollmentStart and enrollmentEnd?}

    C -->|Both null| D[Always open - no window restriction]
    C -->|Start set and End null| E{enrollmentStart <= now?}
    C -->|Both set| F{enrollmentStart <= now AND enrollmentEnd >= now?}

    E -->|Yes| G[Group included - open-ended enrollment]
    E -->|No| EXCLUDE
    F -->|Yes| G
    F -->|No| EXCLUDE

    D --> INCLUDE[Group included in results]
    G --> INCLUDE

    INCLUDE --> I[Group shown in public form dropdown]

    style EXCLUDE fill:#fee2e2
    style INCLUDE fill:#d1fae5
    style D fill:#d1fae5
```

> Note: The enrollment window filter and `group.isActive` check both run at the DB query level via Prisma `where` conditions. There is no `course.isActive` — activity is controlled only at the group level.

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
