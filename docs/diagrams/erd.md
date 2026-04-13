# Entity-Relationship Diagram — Enrollment Flow

```mermaid
erDiagram
    Course {
        string id PK
        string slug UK
        CourseLevel level "nullable - null for radionice"
        string title
        string subtitle "nullable"
        string description
        int ageMin
        int ageMax
        string equipment "nullable"
        float price "nullable"
        decimal priceYear "nullable"
        decimal priceModule "nullable"
        string imageUrl "nullable"
        int sortOrder "default 0"
        boolean isCustom "default false - true for radionice"
    }

    CourseModule {
        string id PK
        string courseId FK
        string title
        string description "nullable"
        int sortOrder "default 0"
    }

    Location {
        string id PK
        string name
        string address
        float lat "nullable"
        float lng "nullable"
        string phone "nullable"
        string email "nullable"
    }

    ScheduledGroup {
        string id PK
        string courseId FK
        string locationId FK
        string name "nullable"
        string date "nullable - specific date for radionice"
        string dayOfWeek "nullable - recurring day for SLR"
        string startTime "nullable"
        string endTime "nullable"
        string schoolYear "nullable"
        int maxStudents "default 12"
        datetime enrollmentStart "nullable"
        datetime enrollmentEnd "nullable"
        boolean isActive "default true"
    }

    TeacherAssignment {
        string id PK
        string userId FK
        string scheduledGroupId FK
    }

    Inquiry {
        string id PK
        string parentName
        string parentEmail
        string parentPhone
        string childFirstName
        string childLastName
        string childDateOfBirth "nullable"
        string childSchool "nullable"
        CourseLevel courseLevelPref "nullable"
        string locationPref "nullable"
        string courseId FK "nullable"
        string scheduledGroupId FK "nullable - preferred group"
        string assignedGroupId FK "nullable - final group"
        string studentId FK "nullable"
        string message "nullable"
        string referralSource "nullable"
        datetime consentGivenAt "nullable"
        InquiryStatus status "NEW - ACCOUNT_CREATED - DECLINED"
    }

    User {
        string id PK
        string email UK
        string username UK "nullable"
        string passwordHash
        string plainPassword "nullable - stored for admin reference"
        string firstName
        string lastName
        string phone "nullable"
        string dateOfBirth "nullable - YYYY-MM-DD for students"
        UserRole role "ADMIN - TEACHER - STUDENT"
        datetime emailVerified "nullable"
    }

    Enrollment {
        string id PK
        string userId FK
        string scheduledGroupId FK
        string schoolYear
        EnrollmentStatus status "default ACTIVE"
    }

    Course ||--o{ CourseModule : "has modules"
    Course ||--o{ ScheduledGroup : "has groups"
    Location ||--o{ ScheduledGroup : "hosts"

    ScheduledGroup ||--o{ TeacherAssignment : "assigned teachers"
    User ||--o{ TeacherAssignment : "teaches"

    Course ||--o{ Inquiry : "courseId - preferred program"
    ScheduledGroup ||--o{ Inquiry : "scheduledGroupId - preferred"
    ScheduledGroup ||--o{ Inquiry : "assignedGroupId - final"

    User ||--o{ Inquiry : "studentId - created student"
    User ||--o{ Enrollment : "enrolled in"
    ScheduledGroup ||--o{ Enrollment : "students enrolled"
```

## Enums

| Enum | Values |
|------|--------|
| UserRole | `ADMIN`, `TEACHER`, `STUDENT` |
| CourseLevel | `SLR_1`, `SLR_2`, `SLR_3`, `SLR_4` |
| InquiryStatus | `NEW`, `ACCOUNT_CREATED`, `DECLINED` |
| EnrollmentStatus | `PENDING`, `ACTIVE`, `COMPLETED`, `CANCELLED` |

## Key Relationships

| Relationship | Description |
|-------------|-------------|
| Course → CourseModule | One course has many modules |
| Course → ScheduledGroup | One course has many groups - time slots |
| ScheduledGroup → Location | Each group meets at one location |
| ScheduledGroup → TeacherAssignment → User | Teachers assigned to groups - many-to-many |
| Inquiry → Course | Parent preferred program - optional |
| Inquiry.scheduledGroupId → ScheduledGroup | Parent preferred group from form - reserves spot |
| Inquiry.assignedGroupId → ScheduledGroup | Admin final group assignment - set on account creation |
| Inquiry → User | Student account created from this inquiry |
| User → Enrollment → ScheduledGroup | Student enrolled in group for a school year |
| Enrollment unique constraint | userId + scheduledGroupId + schoolYear |
| InquiryGroupOption unique constraint | inquiryId + scheduledGroupId |
| TeacherAssignment unique constraint | userId + scheduledGroupId |

## Schedule Pattern

- **Standard SLR courses**: `dayOfWeek` + `startTime`/`endTime` for recurring weekly schedule
- **Radionice - workshops**: `date` + `startTime`/`endTime` for specific one-off dates
