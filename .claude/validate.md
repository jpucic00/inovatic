---
project: inovatic
stack: Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui + Prisma + PostgreSQL (Neon) + Auth.js v5 + Cloudinary + Resend + React Email + Zod + BlockNote + Playwright
default_branch: main
last_validated: 2026-07-09T19:50:00+02:00
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

> Why certain capabilities are skipped, plus standing decisions the skill must respect.

- **2026-06-10 — Inquiry.schoolYear migration backfill intentionally omitted.** `20260604162655_add_inquiry_school_year` adds the column with no backfill although `getInquiries` + the admin dashboard filter strictly on it. User decision: production still holds only dummy data that is reset often. Do NOT re-flag as HIGH unless real production data exists before this migration deploys; in that case add the `createdAt` Sept–Aug backfill (precedent: `20260524182056_add_course_school_year`).
- **2026-06-11 — SONAR_TOKEN in `.env.local` is stale** (server recreated, v26.3.0). Runs after this one should validate the token early and prompt; user intends to regenerate.

## Validation history

> Skill appends one line per run.

- 2026-05-13 10:51 — 170 files reviewed (branch) · 1 auto-fix (sonar gallery Promise reject) · 0 tests added · 2 sonar fixed · FAIL (gallery test 2/2 consistent, 3 HIGH propose-only) · reports/validate-2026-05-13-1051.md
- 2026-05-14 17:07 — 213 files reviewed (branch) · 6 auto-fixes (5 sonar minors + 1 pagination test fix + 1 cloudinary poll bump) · 9 sonar fixed · phase2 164/164 ✓ · phase3 115/121 (1 cloudinary-timing test flake) · per-task Flux: 29 done, 5 stay (w2013br cognitive complexity, z4287i3 JWT staleness, yzmvnod + cgst3g3 diagram drift, yk7ms0u Cloudinary test) · reports/validate-2026-05-14-1707.md
- 2026-05-18 14:51 — 26 files reviewed (fix-delta `dd07bea..HEAD`) · 1 auto-fix (sonar S7758 String.fromCodePoint) · 1 sonar fixed (0 open after) · phase2+phase3 252/282 first pass + spec 15 isolated 52/52 = 282/282 effective (1 known cold-compile flake on /admin/upiti) · Flux: 9/9 verification tasks finalize to done (yzmvnod, w2013br, z4287i3, yk7ms0u, cgst3g3, u52xell, 7m98hdx, tddp7ap, pzk2w3m) · reports/validate-2026-05-18-1451.md
- 2026-05-21 12:35 — 71 files reviewed (branch, commit `2c8dcbf` three-tier test architecture) · 1 auto-fix (corrected misleading slim comment in 28-access-control) · 2 integration test files / 10 tests added — closes 1 HIGH gap (createTeacherComment/deleteTeacherComment server-action authz dropped in the slim) + 1 MEDIUM (getGroupAttendance roster scoping) · sonar 0 open · unit 336/336 · integration 56/56 · E2E 147 pass + 1 flake (25-attendance markSession, passed on isolated retry — cold route-compile race after slim removed UI-seed warmup) · 4 MEDIUM + 1 LOW proposed · Flux: 18/18 verification tasks → done · reports/validate-2026-05-21-1235.md
- 2026-05-23 14:51 — 73 files reviewed (branch `2c8dcbf..HEAD` 9 commits + 15 working-tree files) on 7 in-verification tasks the user had already pushed · 6 auto-fixes (1 HIGH merge regression in working-tree inquiry.ts re-applying i6oytr8 declineInquiry on top of d8ml9g0 capacity work + 1 LOW GRADE_LABELS centralization in upiti/[id] + 1 CRITICAL sonar S3776 cognitive complexity in createStudentFromInquiry via sendInquiryCredentialsEmail extraction + 2 MINOR sonar S6606/S6644 + 1 MINOR sonar S7737 + 1 HIGH e2e test regex regression from xutm2f0 caption format change) · sonar 4 open → 0 after fixes · unit 346/346 · integration 70/70 · E2E phase2/22 2/2 + phase2/15 37 pass + 1 fixed → skip-on-seed · UI verification: capacity chip (Popunjeno red + Još 2 slobodna mjesta amber), decline-reason rendered, GRADE_LABELS rendering, school-year switcher in sidebar · Flux: 7/7 verification tasks → done · 1 MEDIUM proposed (archived-year guard on student.ts enrollment actions — xutm2f0 scope gap) + 5 LOW + 2 diagram updates + 8 test gaps · reports/validate-2026-05-23-1451.md
- 2026-05-24 20:55 — 32 files reviewed (branch `origin/main..HEAD` 9 commits) on 7 in-verification tasks · 2 auto-fixes (Object.freeze ARCHIVED_ERROR in school-year-guard.ts + 5-line single-retry policy comment on runWithGroupCapacityGuard) · 2 e2e test bug fixes (spec 22 radionica seed missing schoolYear after 1dad61b cookie scoping; spec 16 decline-inquiry test missing reason fill after 736f2ea — Zod requires min 3 trimmed) · 3 new unit test files / 13 tests added (`school-year-guard.test.ts` 5, `group-capacity-chip.test.tsx` 5, +3 to `inquiry.test.ts` for workshop-sentinel rejection) · sonar 0 open · unit 363/363 · integration 78/78 · E2E phase2/22 2/2 + phase2/15 38 pass + 1 skip + phase2/16 43/43 (1 flake at L691 edit-group cold compile after auto-fix HMR — passed clean on retry) · Flux: 7/7 verification tasks → done · 1 HIGH + 2 MEDIUM + 9 LOW proposed (email-failure orphan in createStudentFromInquiry/createStudentManually, string-matching control flow in catch, status:notIn fragility, getInquiry dead-data fetch, public submitInquiry archived guard, partial FK indexing, moduleScheduleIds cross-course leak, a11y aria-live × 3) + 2 diagram updates (sequence-diagram.md declineInquiry rename + flowchart.md capacity-guard pattern) + 6 test-coverage gaps · reports/validate-2026-05-24-2038.md
- 2026-06-26 12:17 — 21 files reviewed (branch `origin/main..HEAD` 4 commits = the impl of 2026-06-11's propose-only items) · 2 auto-fixes (2× Sonar S3358 nested-ternary: group-materials-view.ts featuredRobocamp + enrollment-payment-panel.tsx icon) · sonar S3776 9→0 (the whole point of the diff), project open 8→6 · 5 new integration tests / 2 files (admin-students-year-filter.test.ts 4 + getInquiryCourses radionica year-scope +1) closing the only 2 uncovered new behaviors (getStudents schoolYear filter, getInquiryCourses) · unit 545/545 · integration 180/180 · E2E skipped (no working-tree change affects browser; only UI delta is behavior-identical ternary extraction) · 0 HIGH · 4 propose-only: 2× S2301 material.ts (Won't-Fix — splitting re-raises CC), S6848 holiday-calendar onMouseLeave container (Won't-Fix), format.ts local-vs-UTC getters (LOW latent), select aria-labels (LOW a11y) · Flux: 4/4 in-scope verification tasks → done (eccignn, snke7i5, 72zqzu9, 1c15g6o). THEN (user-requested) validated + finalized the other 6 Verification tasks (already merged to origin/main): bwv9tng + qe4wj30 (unit/int/lint only — green), sft2oc8 (E2E 33-payments 5/5), atn0c8s (E2E 32 + 24-main), ljrx4wc (E2E 24:68 + int), f56nzlo (int public-enrollment-window) → all done = 10/10 Verification cleared. E2E incidents: foreign next-server v16.2.1 squatting on :3000 (freed, user-approved — restart their other dev server); macOS revoked ~/Documents access mid-run (getcwd EPERM → restart Claude Code to recover; see reference/macos-tcc-revocation-midsession.md). Test-only fixes: merged-tab dual-render `.first()` in phase3.ts + 24-materials.spec.ts. Residual E2E test-debt flagged as follow-up task (16:266 stale /admin/programi card locator, 24:561 radionica seed, 22:55 group-seed). · reports/validate-2026-06-26-1217.md
- 2026-06-11 00:40 — 114 files reviewed (delta `534bb02..HEAD` 23 commits + working tree) on 26 in-verification tasks · 40 auto-fixes (38 sonar mechanical across 10 files incl. S4144 makeDraftHandlers extraction + aria-label on attendance note input + AbortSignal.timeout on holiday-api) · sonar 47→9 open (9 S3776 propose-only) · 5 e2e test bugs fixed (spec 32 Sunday-start range vs computeWorkshopLabels Sunday-skip; spec 18 dropped-credentials-modal helper, SHIFT_DATES date rot → dynamic, historization rerun-idempotency; spec 16 radionica dateStart+dateEnd ×2, Radionice-tab clicks, tr-scoped asserts vs weekly-grid lane-packing) · 3 new test files / 19 tests (copy-button 4u, student-year-sections 7u, admin-student-email-contract 4i) · unit 475/475 · integration 139/139 · E2E spec16 43/43 + spec18 10/10 + spec30 6/6 + spec32 2/2 + full phase2+3 confirmation run · dev-DB maintenance: 2× garbage-group cleanup + 2025/2026 module-window re-stagger (date rot — recurs after 2026-08-16) · HIGH migration backfill waved off by user (dummy prod data — see decisions log) · 1 MEDIUM (bulkImportHolidays TOCTOU) + 7 LOW + 9 S3776 + 3 diagram updates proposed · epic cross-check: getActivePrograms gap = existing task ql3p3ps · reports/validate-2026-06-11-0040.md
- 2026-07-09 19:50 — full delta since last run (branch `origin/main..HEAD` 8 commits, 112 files + working tree 14 files) on ALL 17 in-verification tasks (arch-simplification epic P2–P15 + party 9rjfdn4 + createGroup g589zgp + E2E-locators h8zk88v) · 5 parallel review agents: 0 HIGH, 1 MEDIUM regression FIXED (P6 pinned group startTime/endTime to `^\d{2}:\d{2}$` but the create/edit forms use free-text inputs → single-digit "9:00" was blocked; relaxed to `^\d{1,2}:\d{2}$`) · LOW fixes: P11 first-Zod-issue surfaced English defaults on un-messaged payment/module/enrollment-window validators → added Croatian; P15 seed `[slr1..slr4]` destructure → `seededCourses.map`; package.json radix-ui re-indent · Sonar 17 on changed files → 15 auto-fixed (S3863 dup-imports ×6, S3358/S4624 ternary+nested-template, S7781 replaceAll, S7764 globalThis), 2 Won't-Fix (S6848 calendar grid, S7735 canEdit!==false); project 20→6 · 3 new integration tests / 8 cases closing P3 (deleteCourse guard + deleteStudent atomic detach/rollback) + P4 (student-detail payload scope: passwordHash absent, plainPassword kept, payment admin-only) · unit 563/563 · integration 203/203 · E2E h8zk88v: stale phase3 fixture re-bootstrapped → phase3/22 4/4 + phase3/24 + 16:266 green; lone 16:457 fail = dev-data (no enrollable SLR1 group in dev DB), not a regression; user's own :3000 dev server causes login-hydration flakes · browser /proslave party form OK · KEY FINDING: committed HEAD did NOT compile standalone — student.ts (P4/P8) imports PaginatedResult from @/lib/action-types but the export was only in the uncommitted P11 change; resolved by committing the working tree · Flux 17/17 → done · reports/validate-2026-07-09-1950.md
