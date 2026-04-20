# End-to-End Enrollment Flow — Sequence Diagram

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
    Note right of Server: Filters by active enrollment window only - schoolYear ignored. Standard courses also require a next-starting ModuleSchedule.
    Server-->>Web: Programs with groups, spots (next-starting module for standards), enrollment windows

    Note over Parent, Web: Step 1: parentName, parentEmail, parentPhone
    Note over Parent, Web: Step 2: childFirstName, childLastName, childDateOfBirth, childSchool
    Note over Parent, Web: Step 3: grade, group preference, message, referralSource, GDPR consent

    Parent->>Web: Fills 3-step form and submits
    Web->>Server: submitInquiry(formData)

    Server->>Server: Validate with Zod inquirySchema
    Server->>Server: Create Inquiry status NEW consentGivenAt now

    alt scheduledGroupId provided
        Server->>Server: Spot reserved immediately via preferredInquiries count
    end

    Server->>Email: Send InquiryConfirmationEmail
    Email-->>Parent: Zaprimili smo vasu prijavu with child name and DOB
    Server-->>Web: Success response
    Web-->>Parent: Thank you page

    Note over Parent, Admin: PHASE 2 — Admin Reviews Inquiry

    Admin->>Server: Views /admin/upiti inquiry list
    Server-->>Admin: Inquiries with search filter status pagination

    Admin->>Server: Opens /admin/upiti/id inquiry detail
    Server-->>Admin: Parent info child info preferred group consent timestamp

    Note over Parent, Admin: OPTIONAL — Admin Sends Schedule Options

    Admin->>Server: Selects groups then sendScheduleOptions inquiryId groupIds

    Server->>Server: Guard: inquiry status must be NEW
    Server->>Server: Fetch selected groups with location data
    Note right of Server: No DB writes, status stays NEW

    Server->>Email: Send ScheduleOptionsEmail
    Email-->>Parent: Dostupni termini za childName with group list day time location

    Note right of Parent: Parent reviews options and replies outside system via email phone or in-person
    Note right of Admin: Admin can send schedule options multiple times

    Note over Parent, Admin: PHASE 3 — Admin Creates Account and Enrolls

    Admin->>Server: Opens CreateAccountDialog for inquiry
    Server-->>Admin: Course modules and ModuleSchedules for group.schoolYear

    Note right of Admin: For standard courses admin must pick at least one ModuleSchedule. For radionice the step is skipped.

    Admin->>Server: createStudentFromInquiry inquiryId groupId moduleScheduleIds

    Server->>Server: Guard: status not ACCOUNT_CREATED or DECLINED

    alt childDateOfBirth available on inquiry
        Server->>Server: Find existing User where role STUDENT and firstName + lastName + dateOfBirth match
    else No DOB
        Server->>Server: Skip dedup treat as new student
    end

    alt New student
        Server->>Server: generateUsername strip diacritics lowercase add suffix if taken
        Server->>Server: generateSimplePassword 6 chars
        Server->>Server: hashPassword bcrypt 12 rounds
        Server->>Server: Create User role STUDENT email username at student.inovatic.local
        Server->>Server: Store plainPassword on User for admin reference
        Server->>Server: Copy parentName parentEmail parentPhone childSchool gdprConsentAt from Inquiry to User
    end

    Server->>Server: Check for existing Enrollment userId + groupId + schoolYear
    alt No existing enrollment
        Server->>Server: Create Enrollment (no status column, row presence is the signal)
    end

    alt moduleScheduleIds non-empty
        Server->>Server: moduleEnrollment.createMany skipDuplicates - one row per schedule
    end

    Server->>Server: Update Inquiry status ACCOUNT_CREATED studentId assignedGroupId

    Server->>Email: Send AccountCredentialsEmail with credentials and group info
    Email-->>Parent: Pristupni podaci za childName with username password and group details

    Server-->>Admin: Success with username password studentId

    Note over Parent, Admin: ALTERNATE ENTRY PATHS

    alt Manual student creation via CreateStudentDialog
        Admin->>Server: getGroupsForCourseInYears courseId
        Server-->>Admin: Groups across current and future school years
        Admin->>Server: createStudentManually firstName lastName dob group moduleScheduleIds
        Server->>Server: Same dedup flow plus createStudentCore enrollment path
        Note right of Server: No Inquiry row involved. Admin can pre-enroll into a future-year group without any parent form.
    end

    alt Add existing student to a new group
        Admin->>Server: Opens student detail then addEnrollment studentId groupId
        Server->>Server: Reuses createStudentCore enrollment path - no user creation
    end

    Note over Parent, Admin: ALTERNATE EXITS

    alt Admin declines inquiry
        Admin->>Server: updateInquiryStatus id DECLINED
        Server->>Server: Status to DECLINED spot freed no automated email
    end

    alt Admin deletes inquiry
        Admin->>Server: deleteInquiry id
        Server->>Server: Delete Inquiry record spot freed
    end

    alt Admin removes a module from an enrolled student
        Admin->>Server: deleteModuleEnrollment moduleEnrollmentId
        Server->>Server: Hard delete single row - later modules for same student untouched
    end

    alt Admin closes a running module early
        Admin->>Server: closeModuleSchedule moduleScheduleId
        Server->>Server: Set ModuleSchedule.endDate to now - group advances to next module
    end

    alt Admin removes a whole enrollment
        Admin->>Server: deleteEnrollment enrollmentId
        Server->>Server: Hard delete Enrollment - onDelete Cascade removes ModuleEnrollment rows
    end
```

> The "available spots" number surfaced in the public form for standard courses comes from the **next-starting** module (first module by `sortOrder` whose schedule for that group's `schoolYear` has `startDate > now`), not the currently-running module. A module that's already running is past the point of new enrolments; the group's public capacity reflects the next one in line.
