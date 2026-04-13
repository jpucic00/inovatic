# Inquiry Status — State Machine

```mermaid
stateDiagram-v2
    [*] --> NEW: Parent submits inquiry form

    NEW --> ACCOUNT_CREATED: Admin creates account
    NEW --> DECLINED: Admin declines

    ACCOUNT_CREATED --> [*]
    DECLINED --> [*]

    note right of NEW
        Inquiry created in DB
        consentGivenAt set to now
        Email: InquiryConfirmation to parent
        Spot reserved if scheduledGroupId provided
        Admin can send schedule options email at any time without changing status
    end note

    note left of ACCOUNT_CREATED
        Guard: status not ACCOUNT_CREATED or DECLINED
        User created or reused via dedup
        Enrollment ACTIVE created
        Inquiry.studentId + assignedGroupId set
        Email: AccountCredentials to parent
        TERMINAL STATE
    end note

    note left of DECLINED
        Spot freed from preferredInquiries count
        No automated email
        TERMINAL STATE
    end note
```

## Transition Rules

| From | To | Action | Guard | Side Effects |
|------|-----|--------|-------|-------------|
| -- | `NEW` | submitInquiry | Zod validation | Inquiry created, confirmation email, spot reserved if group selected |
| `NEW` | `ACCOUNT_CREATED` | createStudentFromInquiry | `status !== ACCOUNT_CREATED && status !== DECLINED` | User + Enrollment created, credentials email, studentId + assignedGroupId set |
| `NEW` | `DECLINED` | updateInquiryStatus | None in code | Spot freed, no automated email |

## Non-Status Actions

| Action | When | Side Effects |
|--------|------|-------------|
| sendScheduleOptions | Any time while status is NEW | Fetches selected groups and sends schedule email to parent. No database writes. |

## Terminal States

- **ACCOUNT_CREATED** — student account exists, enrollment is active
- **DECLINED** — inquiry rejected, spot freed

## Deletion

- `deleteInquiry` has no status guard — can delete at any status
- Does NOT cascade to User or Enrollment if already created
