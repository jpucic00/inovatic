---
project: inovatic
stack: Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui + Prisma + PostgreSQL (Neon) + Auth.js v5 + Cloudinary + Resend + React Email + Zod + next-intl + BlockNote + Playwright
default_branch: main
last_validated: 2026-05-24T20:55:00+02:00
created: 2026-05-11
---

# Validate memory — Inovatic

> Auto-managed by `/validate`. The capability table, tooling section, decisions log, and history are rewritten by the skill on each run. The **Project conventions** section is user-owned — edit freely.

## Capability status

| Capability | Status | Notes |
|---|---|---|
| Lint | ✅ configured | `npm run lint:all` (ESLint + tsc + knip) |
| Type check | ✅ configured | `npx tsc --noEmit` (also part of `lint:all`) |
| Tests | ✅ configured | Playwright; specs in `tests/phaseN/NN-feature.spec.ts` |
| SonarQube | ✅ configured | Local Docker; dashboard http://localhost:9000/dashboard?id=inovatic |
| Diagrams | ✅ configured | `docs/diagrams/*.md` — 6 Mermaid files |
| Dev server | ✅ configured | `.claude/launch.json` name `inovatic-dev`, port 3000 |

## Tooling commands

| Step | Command |
|---|---|
| Lint (all-in-one) | `npm run lint:all` |
| Lint only | `npm run lint` |
| Type check | `npx tsc --noEmit` |
| Dead code | `npm run lint:dead` (knip) |
| Test (all) | `npx playwright test tests/` |
| Test (one spec) | `npx playwright test tests/phase3/NN-foo.spec.ts` |
| Sonar start | `npm run sonar:start` |
| Sonar stop | `npm run sonar:stop` |
| Sonar scan | `SONAR_TOKEN=<from .env.local> npm run sonar:scan` |
| Dev server | `.claude/launch.json` name `inovatic-dev`, port 3000 |

Sonar dashboard: http://localhost:9000/dashboard?id=inovatic · project key: `inovatic`

## Project conventions

> **User-owned section.** The skill never overwrites this. Edit freely.

### Test framework + structure

- **Framework:** Playwright (`@playwright/test`).
- **Location:** `tests/phaseN/NN-feature.spec.ts` — numbered sequentially within each phase folder. Latest existing: `tests/phase3/29-gallery.spec.ts`. New specs use the next available number in the appropriate phase.
- **Helpers:** all shared utilities in `tests/helpers/phase3.ts`. Always import from there — never inline login or factory logic.
  - Constants: `BASE` (http://localhost:3000). Admin credentials are baked into `loginAsAdmin(page)` — call the helper rather than referencing the constants directly.
  - Login: `loginAsAdmin(page)`, `loginWithEmail(page, email, password)`
  - Factories: `createTeacher`, `createStudentInGroup`, `createStudentNoEnrollment`, `assignTeacherToGroup`, `addEnrollmentToStudent`, `addLinkMaterial`, `markSession`
  - Group selection: `pickStandardGroupId(page)`, `pickFirstGroupId(page)`, `collectGroupIds(page, count)`
  - Types: `TeacherData`, `StudentData`
  - Assertions: `expectNotFoundPage(page)` (matches "not found", "404", "stranica nije pronađena")
- **Fixtures:** `tests/fixtures/phase3-state.json` (bootstrapped group IDs, written by `20-bootstrap.spec.ts`), `tests/fixtures/sample.png` (70-byte 1×1 PNG for upload tests).
- **Run-unique IDs:** every spec uses `const RUN_ID = Date.now().toString().slice(-6)` and suffixes emails/lastNames with it to avoid DB collisions on re-runs.
- **Serial mode:** specs that share `let seeded` state across tests must use `test.describe.configure({ mode: 'serial' })`.
- **Long beforeAll:** `test.setTimeout(240_000)` for seed-heavy `beforeAll`.
- **Date input workaround:** `fill()` doesn't always trigger React onChange — dispatch `new Event('input', { bubbles: true })` after, especially for `markSession` flow and specs 25/27/29.
- **Dev server required:** Playwright tests in this repo run against `http://localhost:3000` — confirm `npm run dev` is running before `npx playwright test`.

### Auth / security patterns

- **Guards** from `src/lib/auth-guard.ts`: `requireAdmin()`, `requireTeacher()`, `requireStudent()`, `requireAuth()`. Every exported async server action mutation must call one.
- **Group-scoped** from `src/lib/teacher-guard.ts`: `assertTeacherOwnsGroup(groupId)` (ADMIN bypass baked in), `assertStudentInGroup`, `canDeleteComment`. Teachers must 404 (not 403) on colleagues' groups.
- **Inquiry workflow:** NEW → ACCOUNT_CREATED (or DECLINED). Transitions in `src/actions/admin/inquiry.ts`.
- **Role-based login redirect:** ADMIN → `/admin`, TEACHER → `/nastavnik`, STUDENT → `/portal` (in `src/actions/login.ts`).

### Diagram inventory

`docs/diagrams/*.md` (Mermaid embedded — no `.mmd`/`.puml`):

| File | Topic | Trigger to update |
|---|---|---|
| `erd.md` | Entity-relationship (Prisma schema) | Any change to `prisma/schema.prisma` — new models, fields, relations, enums, indexes |
| `sequence-diagram.md` | End-to-end enrollment flow (inquiry → admin → account → email) | Changes in `src/app/(public)/upisi/**`, `src/actions/inquiry.ts`, `src/actions/admin/inquiry.ts`, `src/actions/admin/student.ts`, `emails/**`, `src/app/(auth)/**` |
| `attendance-flow.md` | Session-date computation + marking flow | Changes in `src/lib/session-dates.ts`, `src/actions/teacher/attendance.ts`, `src/actions/admin/attendance.ts`, or Attendance/ModuleSchedule/ScheduledGroup/Enrollment schema |
| `module-historization.md` | Template-vs-year-instance pattern (SLR 1-4) | Module / CourseModule / ModuleSchedule schema or `src/actions/admin/program.ts`, `src/actions/admin/group.ts` |
| `flowchart.md` | Business-rules flowcharts (spot reservation, group availability) | `src/app/(public)/upisi/**`, `src/lib/enrollment-window.ts`, reservation in `src/actions/inquiry.ts`, capacity calcs |
| `state-machine.md` | InquiryStatus state machine | `InquiryStatus` enum or new transition logic in `src/actions/admin/inquiry.ts` |

Diagram edits are always **propose-only** — draft Mermaid snippets in the report, user applies.

### File buckets (override generic categorization)

| Bucket | Patterns |
|---|---|
| Prisma schema | `prisma/schema.prisma`, `prisma/migrations/**` |
| Server actions | `src/actions/**` (admin: `src/actions/admin/**`, teacher: `src/actions/teacher/**`) |
| API routes | `src/app/api/**` |
| Auth/lib | `src/lib/auth-guard.ts`, `src/lib/teacher-guard.ts`, `src/lib/cloudinary-url.ts`, `src/lib/session-dates.ts` |
| Validators | `src/lib/validators/**` (Zod) |
| UI | `src/components/**`, `src/app/(public\|admin\|teacher\|portal)/**/page.tsx`, `**/layout.tsx`, `**/loading.tsx` |
| Emails | `emails/**` (React Email) |
| Tests | `tests/**` |
| Diagrams | `docs/diagrams/**` |
| Config | `package.json`, `tsconfig.json`, `next.config.*`, `playwright.config.ts`, `sonar-project.properties`, `.eslintrc.json` |

### Multi-resolution browser check — page mapping

When UI files change, exercise these routes at 1440×900 / 768×1024 / 390×844:

| Changed area | Route(s) |
|---|---|
| `src/app/(public)/**` | `/`, `/programi`, `/o-nama`, `/novosti`, `/upisi`, `/kontakt`, plus the specific changed page |
| `src/app/(admin)/admin/**` | `/admin` dashboard, plus the specific changed admin page (e.g. `/admin/grupe/<seed-id>`, `/admin/ucenici/<seed-id>`) |
| `src/app/(teacher)/nastavnik/**` | `/nastavnik`, `/nastavnik/grupa/<seed-id>` (all tabs: moduli, materijali, dolazak, komentari, galerija) |
| `src/app/(portal)/portal/**` | `/portal`, `/portal/grupa/<seed-id>`, `/portal/grupa/<seed-id>/galerija` |
| `src/components/**` (admin shell) | Both `/admin` and a representative `/admin/grupe/<seed-id>` |

Seed group/student IDs from `tests/fixtures/phase3-state.json` (run `20-bootstrap.spec.ts` first if missing).

### Project-specific code-review rules

In addition to the universal checks in the skill's Phase 2 Track B, also enforce:

1. **Cloudinary cleanup:** any server action that deletes an entity with associated Cloudinary assets must call `destroyCloudinaryAssets` or `destroyCloudinaryAssetsByPublicId` from `src/lib/cloudinary-url.ts`. Affects: articles, materials, gallery images, course images, student/teacher avatars.
2. **Migration safety (HARD RULE):** every `prisma/migrations/**` change must be production-safe — no NOT NULL columns added without a default, no column drops without confirmation, no type changes that would lose precision, FKs need indexes.
3. **Server actions return serializable values:** no `Date`, `Decimal`, `Buffer` in return types — convert to ISO string / number / base64 at the action boundary.
4. **Croatian locale:** new user-facing strings should be in Croatian. Dates `dd.MM.yyyy.` (trailing dot intentional). Currency EUR.
5. **No publish/draft on materials:** attached materials are immediately visible — never reintroduce a published/draft state.
6. **StudentComment is staff-only:** never render comments/reviews/grades in `/portal/*`.
7. **Phase 3 hard rules:** gallery images visible to all enrolled students (no hide-in-group toggle); grades live inside StudentComment as MODULE_REVIEW type.
8. **shadcn/ui sources:** files under `src/components/ui/` are vendored — don't aggressively refactor; sonar exclusions already cover the worst-flagged ones.

### Croatian copy reference for tests

| English | Croatian |
|---|---|
| Save | Spremi |
| Cancel | Odustani |
| Create | Kreiraj |
| Delete | Obriši |
| Login | Prijava |
| Logout | Odjava |
| Group | Grupa |
| Teacher | Nastavnik |
| Student | Učenik |
| Module | Modul |
| Attendance | Dolazak |
| Present | Prisutan |
| Absent | Odsutan |
| Comments | Komentari |
| Materials | Materijali |
| Gallery | Galerija |
| Not found | Stranica nije pronađena |
| Saved (attendance) | Evidencija spremljena. |

When asserting in Playwright specs, use the Croatian strings — never the English originals.

### Sonar exclusions

Already excluded in `sonar-project.properties`:
- `node_modules/`, `.next/`, `playwright-report/`, `test-results/`
- `prisma/seed.ts`
- Vendored shadcn/ui carousel, table components

### Report destination

`reports/validate-YYYY-MM-DD-HHmm.md` in the repo root. Screenshots under `reports/screens/`.

## Decisions log

> Why certain capabilities are skipped. (Empty — everything is configured.)

_None yet._

## Validation history

> Skill appends one line per run.

- 2026-05-13 10:51 — 170 files reviewed (branch) · 1 auto-fix (sonar gallery Promise reject) · 0 tests added · 2 sonar fixed · FAIL (gallery test 2/2 consistent, 3 HIGH propose-only) · reports/validate-2026-05-13-1051.md
- 2026-05-14 17:07 — 213 files reviewed (branch) · 6 auto-fixes (5 sonar minors + 1 pagination test fix + 1 cloudinary poll bump) · 9 sonar fixed · phase2 164/164 ✓ · phase3 115/121 (1 cloudinary-timing test flake) · per-task Flux: 29 done, 5 stay (w2013br cognitive complexity, z4287i3 JWT staleness, yzmvnod + cgst3g3 diagram drift, yk7ms0u Cloudinary test) · reports/validate-2026-05-14-1707.md
- 2026-05-18 14:51 — 26 files reviewed (fix-delta `dd07bea..HEAD`) · 1 auto-fix (sonar S7758 String.fromCodePoint) · 1 sonar fixed (0 open after) · phase2+phase3 252/282 first pass + spec 15 isolated 52/52 = 282/282 effective (1 known cold-compile flake on /admin/upiti) · Flux: 9/9 verification tasks finalize to done (yzmvnod, w2013br, z4287i3, yk7ms0u, cgst3g3, u52xell, 7m98hdx, tddp7ap, pzk2w3m) · reports/validate-2026-05-18-1451.md
- 2026-05-21 12:35 — 71 files reviewed (branch, commit `2c8dcbf` three-tier test architecture) · 1 auto-fix (corrected misleading slim comment in 28-access-control) · 2 integration test files / 10 tests added — closes 1 HIGH gap (createTeacherComment/deleteTeacherComment server-action authz dropped in the slim) + 1 MEDIUM (getGroupAttendance roster scoping) · sonar 0 open · unit 336/336 · integration 56/56 · E2E 147 pass + 1 flake (25-attendance markSession, passed on isolated retry — cold route-compile race after slim removed UI-seed warmup) · 4 MEDIUM + 1 LOW proposed · Flux: 18/18 verification tasks → done · reports/validate-2026-05-21-1235.md
- 2026-05-23 14:51 — 73 files reviewed (branch `2c8dcbf..HEAD` 9 commits + 15 working-tree files) on 7 in-verification tasks the user had already pushed · 6 auto-fixes (1 HIGH merge regression in working-tree inquiry.ts re-applying i6oytr8 declineInquiry on top of d8ml9g0 capacity work + 1 LOW GRADE_LABELS centralization in upiti/[id] + 1 CRITICAL sonar S3776 cognitive complexity in createStudentFromInquiry via sendInquiryCredentialsEmail extraction + 2 MINOR sonar S6606/S6644 + 1 MINOR sonar S7737 + 1 HIGH e2e test regex regression from xutm2f0 caption format change) · sonar 4 open → 0 after fixes · unit 346/346 · integration 70/70 · E2E phase2/22 2/2 + phase2/15 37 pass + 1 fixed → skip-on-seed · UI verification: capacity chip (Popunjeno red + Još 2 slobodna mjesta amber), decline-reason rendered, GRADE_LABELS rendering, school-year switcher in sidebar · Flux: 7/7 verification tasks → done · 1 MEDIUM proposed (archived-year guard on student.ts enrollment actions — xutm2f0 scope gap) + 5 LOW + 2 diagram updates + 8 test gaps · reports/validate-2026-05-23-1451.md
- 2026-05-24 20:55 — 32 files reviewed (branch `origin/main..HEAD` 9 commits) on 7 in-verification tasks · 2 auto-fixes (Object.freeze ARCHIVED_ERROR in school-year-guard.ts + 5-line single-retry policy comment on runWithGroupCapacityGuard) · 2 e2e test bug fixes (spec 22 radionica seed missing schoolYear after 1dad61b cookie scoping; spec 16 decline-inquiry test missing reason fill after 736f2ea — Zod requires min 3 trimmed) · 3 new unit test files / 13 tests added (`school-year-guard.test.ts` 5, `group-capacity-chip.test.tsx` 5, +3 to `inquiry.test.ts` for workshop-sentinel rejection) · sonar 0 open · unit 363/363 · integration 78/78 · E2E phase2/22 2/2 + phase2/15 38 pass + 1 skip + phase2/16 43/43 (1 flake at L691 edit-group cold compile after auto-fix HMR — passed clean on retry) · Flux: 7/7 verification tasks → done · 1 HIGH + 2 MEDIUM + 9 LOW proposed (email-failure orphan in createStudentFromInquiry/createStudentManually, string-matching control flow in catch, status:notIn fragility, getInquiry dead-data fetch, public submitInquiry archived guard, partial FK indexing, moduleScheduleIds cross-course leak, a11y aria-live × 3) + 2 diagram updates (sequence-diagram.md declineInquiry rename + flowchart.md capacity-guard pattern) + 6 test-coverage gaps · reports/validate-2026-05-24-2038.md
