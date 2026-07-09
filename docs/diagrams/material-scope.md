# MaterialScope — Discriminated Union and Per-Group Hide

`Material` rows carry a `scope` of `MODULE`, `COURSE`, or `GROUP`. Each value of the enum picks exactly one FK column that must be non-null — the other two must be null. The invariant is enforced at three layers: a Zod discriminated union at the action boundary, a Prisma model with three nullable FKs, and a SQL `CHECK` constraint at the DB. On top of that, `MaterialGroupHide` lets a teacher hide an inherited MODULE/COURSE-scoped material from a single `ScheduledGroup` without affecting any other group.

## Schema shape

```mermaid
erDiagram
    CourseModule   ||--o{ Material : "scope=MODULE"
    Course         ||--o{ Material : "scope=COURSE"
    ScheduledGroup ||--o{ Material : "scope=GROUP"
    Material       ||--o{ MaterialGroupHide : "per-group hide rows"
    ScheduledGroup ||--o{ MaterialGroupHide : "hidden here"

    Material {
        string id PK
        MaterialScope scope "MODULE | COURSE | GROUP"
        string moduleId FK "non-null iff scope=MODULE"
        string courseId FK "non-null iff scope=COURSE"
        string scheduledGroupId FK "non-null iff scope=GROUP"
        string title
        MaterialType type "DOCUMENT | PRESENTATION | VIDEO | LINK | ROBOCAMP"
        string fileUrl "Cloudinary (DOCUMENT/PRESENTATION/VIDEO file)"
        string externalUrl "YouTube/Vimeo (VIDEO) or LINK target"
    }

    MaterialGroupHide {
        string id PK
        string materialId FK
        string scheduledGroupId FK
    }
```

> Source: `prisma/schema.prisma` (`Material`, `MaterialGroupHide`, `MaterialScope` enum). Indexes mirror the three branches: `(scope, moduleId)`, `(scope, courseId)`, `(scope, scheduledGroupId)`.

## Discriminated union — which FK is required

```mermaid
flowchart TD
    A["createMaterialSchema input"] --> B{scope?}
    B -->|MODULE| M["moduleVariant (.strict())<br/>moduleId required<br/>no courseId / scheduledGroupId"]
    B -->|COURSE| C["courseVariant (.strict())<br/>courseId required<br/>no moduleId / scheduledGroupId"]
    B -->|GROUP| G["groupVariant (.strict())<br/>scheduledGroupId required<br/>no moduleId / courseId"]

    M --> Z["superRefine: validateTypeUrlPairing<br/>DOCUMENT/PRESENTATION need fileUrl<br/>VIDEO needs file XOR YouTube/Vimeo URL<br/>LINK needs externalUrl only"]
    C --> Z
    G --> Z

    Z --> DB[("Prisma write")]
    DB --> CHK{"DB CHECK<br/>Material_scope_fk_check"}

    CHK -->|"scope=MODULE AND moduleId IS NOT NULL"| OK[Row inserted]
    CHK -->|"scope=COURSE AND courseId IS NOT NULL"| OK
    CHK -->|"scope=GROUP AND scheduledGroupId IS NOT NULL"| OK
    CHK -->|otherwise| ERR[CHECK violation — write rejected]

    style M fill:#dbeafe
    style C fill:#fde68a
    style G fill:#d1fae5
    style OK fill:#d1fae5
    style ERR fill:#fee2e2
```

> Sources: Zod variants in `src/lib/validators/material.ts:23-49`; DB `CHECK` in `prisma/migrations/20260423123802_phase3_materials_attendance/migration.sql:36-41`. Belt-and-braces by design — Zod prevents typed callers from getting it wrong; the CHECK prevents drift via raw SQL or forgotten migrations.

## Effective materials for a student

```mermaid
flowchart LR
    CTX["MaterialScopeContext<br/>{scheduledGroupId, courseId, moduleIds[]}"]
    CTX --> B1["scope=GROUP AND scheduledGroupId = ctx.scheduledGroupId"]
    CTX --> B3["scope=COURSE AND courseId = ctx.courseId"]
    CTX --> Q1{"moduleIds.length > 0?"}
    Q1 -->|Yes| B2["scope=MODULE AND moduleId IN ctx.moduleIds"]
    Q1 -->|No| SK1["(skip MODULE branch)"]

    B1 --> UNION["OR — union of scope branches"]
    B2 --> UNION
    B3 --> UNION
    SK1 --> UNION

    UNION --> HIDE{"hiddenInGroups.some({scheduledGroupId})?"}
    HIDE -->|Yes| HIDDEN["Excluded by MaterialGroupHide"]
    HIDE -->|No| VISIBLE["Visible to student"]

    style VISIBLE fill:#d1fae5
    style HIDDEN fill:#fee2e2
    style SK1 fill:#f3f4f6
```

> Source: `buildEffectiveMaterialsWhere(ctx)` in `src/lib/material-query.ts:24-43`. COURSE branch is always included — both standard programs (program-wide materials) and radionice (course-wide materials). MODULE branch only added when `moduleIds.length > 0`. Returns a `Prisma.MaterialWhereInput` with `NOT hiddenInGroups.some(...)` applied uniformly across all branches.

## Summary

| Scope | Required FK | What students see | Hide-per-group? |
|---|---|---|---|
| `MODULE` | `moduleId → CourseModule` | Every `ScheduledGroup` whose course owns that module | Yes — `MaterialGroupHide` on a specific group hides this row for that group only |
| `COURSE` | `courseId → Course` | Every `ScheduledGroup` of that course (standard and radionice). On standard programs = "whole program" materials visible across all modules. | Yes — same mechanism |
| `GROUP` | `scheduledGroupId → ScheduledGroup` | Only the one `ScheduledGroup` it points at | N/A — already group-scoped |

## Why three layers

- **Zod variant**: best error messages at the form layer, Croatian copy ("Odaberite modul", "Odaberite program", "Odaberite grupu") sits next to the field that's wrong.
- **Prisma optional FKs**: the model can't express "exactly one of three is non-null", so all three are typed `String?`. The compiler can't catch a missing FK on its own.
- **SQL `CHECK`**: last line of defense. A migration or hand-rolled query that bypasses Zod still can't insert an invalid row.
