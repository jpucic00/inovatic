---
project: inovatic
stack: Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui + Prisma + PostgreSQL (Neon) + Auth.js v5 + Cloudinary + Resend + React Email + Zod + BlockNote + Playwright
default_branch: main
last_validated: 2026-07-31T10:16:00+02:00
created: 2026-05-11
---

# Validate memory — Inovatic

> Auto-managed by `/validate`. The capability table, tooling section, decisions log, and history are rewritten by the skill on each run. The **Project conventions** section is user-owned — edit freely.

## Capability status

| Capability | Status | Notes |
|---|---|---|
| Lint | ✅ configured | `npm run lint:all` (ESLint + tsc + knip + unit tier) |
| Type check | ✅ configured | `npx tsc --noEmit` (also part of `lint:all`) |
| Tests | ✅ configured | Three tiers: unit (`test:unit`, vitest jsdom) · integration (`test:integration`, vitest node + `inovatic_test` DB reset) · E2E (Playwright `tests/phase{1,2,3}`) |
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
| Test (unit) | `npm run test:unit` |
| Test (integration) | `npm run test:integration` (resets `inovatic_test` first) |
| Test (E2E) | `npx playwright test tests/phase1 tests/phase2 tests/phase3` (dev server on :3000; bare `tests/` would collect the vitest tiers and abort) |
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
| `erd.md` | Entity-relationship (Prisma schema) + city-tenancy & historization notes | Any change to `prisma/schema.prisma` — new models, fields, relations, enums, indexes |
| `enrollment-rules.md` | Enrollment gating: per-city windows, capacity, module arc, inquiry flow | `src/actions/public/programs.ts` (getActivePrograms), `src/lib/group-capacity.ts`, `src/actions/inquiry.ts`, CourseEnrollmentWindow schema, `/upisi` flow |
| `attendance-flow.md` | Session-date computation + marking flow (city-filtered holiday cascade) | Changes in `src/lib/session-dates.ts`, `src/actions/teacher/attendance.ts`, `src/actions/admin/attendance.ts`, `src/actions/admin/holidays.ts`, or Attendance/ModuleSchedule/ScheduledGroup/Enrollment schema |
| `gallery-scope.md` | GalleryImage scoping: per-module vs group-wide, city-bound ADMIN pass-through | GalleryImage schema, `src/actions/gallery/**`, `/api/upload/gallery` |
| `material-scope.md` | Material scope model: MODULE/COURSE/GROUP + per-group hides | Material/MaterialGroupHide schema, `src/lib/material-access.ts`, material CRUD actions |
| `role-based-login.md` | Login redirect + session city claim (60s TTL, fail-closed guards) | `src/actions/login.ts`, `src/lib/auth.ts` / `auth-token.ts` / `auth-guard.ts` |

> Consolidated 9→6 in P7 (2026-07-09); the old sequence-diagram / module-historization / flowchart / state-machine files were folded into the six above.

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
6. **StudentComment is staff-only; StudentAssessment is parent-visible read-only (since 2026-07-25):** never render comments (bilješke) in `/portal/*`. The report card DOES render read-only at `/portal/grupa/[groupId]/evaluacija` (`getMyAssessmentForGroup` — enrollment lookup is the gate, ids resolved to labels); editing stays staff-only, and radionice are never graded.
7. **Phase 3 hard rules:** gallery images visible to all enrolled students (no hide-in-group toggle); grades live in `StudentAssessment` — one report card per `(studentId, groupId)`, standard programs only, never radionice (MODULE_REVIEW was removed 2026-07-11).
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

- **2026-07-31 — caffeinate MUST run as its own background task.** `caffeinate … &` inside a Bash command gets reaped by the harness the moment the wrapper exits — the Mac was never protected, and three sleeps killed E2E runs mid-suite (interrupted runs report "N did not run" with huge phantom durations and no failures). Launch `caffeinate -d -i -s -t <secs>` as the background task itself, and re-arm for long runs.
- **2026-07-31 — never run a second dev server against the same worktree during E2E.** A session-owned preview server (`:53997`) sharing `.next` with the main `:3000` server slowed phase2 10–20× (23 min → 90 s for the same specs after stopping it) — same cache-contention mode as two concurrent sessions. Do browser checks, then `preview_stop` before Playwright.
- **2026-07-31 — chunk phase2 under the Bash 10-min cap, and never pipe playwright through `tail`.** The full 10-spec run exceeds a single Bash call's budget when the server is cold (interrupt masquerades as "did not run"), and a `| tail` swallows the failure detail AND the exit code. Run chunks, unpiped, in background tasks.
- **2026-07-31 — dev admin is dual-role now.** jpucic00 gained a TeacherAssignment (dev group "A ponedieljak", 2026-07-29), so every admin login shows the panel chooser. **Owner confirmed keeping the assignment (2026-08-03)** — the panel chooser stays permanently exercised in dev; specs must keep handling it. All 11 phase2 specs' local `loginAsAdmin` helpers now delegate to the panel-aware `tests/helpers/phase3.ts` — never reintroduce a form-driving local login.
- **2026-07-31 — SLR-1 (2025/2026, SPLIT) had NO ModuleSchedule rows** (absence, not rot) — nothing SLR-1 was publicly enrollable, which broke spec 16's public-form section AND spec 17's group-less submission (a grade with offers must pick a termin; spec 17's helper now picks the first offered one). Planted `qa20260730slr1m1..4` mirroring SLR-2's stagger; include SLR-1 in the next seasonal re-stagger (due after 2026-08-16). **Owner confirmed keeping the planted rows (2026-08-03).**
- **2026-07-31 — the sibenik journey wipe must delete TeacherAttendance first.** `TeacherAttendance.scheduledGroupId` is `onDelete: Restrict` (payout evidence, 91a2802): a previous journey run books Slavica's hours, and `wipeSibenikTenant`'s `scheduledGroup.deleteMany` trips the FK without the preceding `teacherAttendance.deleteMany`. Also: the planner writes **20** rows now (Uvod + SLR 1–4) — any "4 courses × 4 modules = 16" assumption is stale.
- **2026-06-10 — Inquiry.schoolYear migration backfill intentionally omitted.** `20260604162655_add_inquiry_school_year` adds the column with no backfill although `getInquiries` + the admin dashboard filter strictly on it. User decision: production still holds only dummy data that is reset often. Do NOT re-flag as HIGH unless real production data exists before this migration deploys; in that case add the `createdAt` Sept–Aug backfill (precedent: `20260524182056_add_course_school_year`).
- **2026-06-11 — SONAR_TOKEN staleness (RESOLVED).** The `.env.local` token validates against the v26.3.0 server (confirmed 2026-06-26 … 2026-07-15). Keep the early `api/authentication/validate` check; no prompt needed while it passes.
- **2026-07-27 — `loginAsAdmin` broke once the seeded admin gained a TeacherAssignment.** Any spec that assigns the dev admin to a group flips login to the dual-role panel chooser. `loginWithEmail` already auto-picked *Administracija*; `loginAsAdmin` drove the form itself and waited for `/admin` forever — so a login that had **succeeded** presented as a 60s hang in whatever `beforeAll` called it. Fixed by delegating `loginAsAdmin` → `loginWithEmail`. If a login-shaped hang reappears, read the Playwright `error-context.md` snapshot first: it showed "Prijava uspješna. Odaberite panel:" in plain text.
- **2026-07-27 — Never run E2E while another session is editing `src/`.** The suite reads the same dev server; half-finished edits surface as unrelated assertion failures. Also true of `npm run test:integration` — two concurrent runs reset the shared `inovatic_test` DB under each other (`57P01 terminating connection due to administrator command`, missing tables).
- **2026-07-27 — The phase3 fixture group saturates and blocks the whole tier.** `createStudentInGroup` enrols into the fixture group from `tests/fixtures/phase3-state.json` and nothing ever cleans up, so after enough runs the group passes `maxStudents` and the capacity guard disables its radio — every spec whose `beforeAll` seeds a student then fails with `element is not enabled` at `helpers/phase3.ts:221`, which reads like an unrelated failure (e.g. "unauthenticated redirect" going red). **Re-running `20-bootstrap.spec.ts` does NOT fix it** — bootstrap reuses the same named groups. Check `SELECT count(*) FROM "Enrollment" WHERE "scheduledGroupId"='<fixture id>'` against `maxStudents`; clear the RUN_ID-named students (delete Attendance → StudentComment → StudentAssessment → ModuleEnrollment → Enrollment → User, in that order — FKs are RESTRICT). Cleared 21 students on 2026-07-27 with the user's approval. **Fixed at the source the same day:** `20-bootstrap.spec.ts` now sets `#create-maxStudents` to `50`, calls `clearFixtureGroupEnrollments()` (`tests/helpers/seed.ts`) so every phase3 run starts from an empty fixture group, and `createStudentInGroup` throws a named capacity error instead of retrying a disabled radio for minutes. Note bootstrap creates a *new* "Test Grupa A/B" pair on every run rather than reusing one, so duplicates accumulate — harmless now that the cleanup runs, but it is why several same-named groups exist with differing `maxStudents`.
- **2026-07-27 — Dev-DB attendance contaminates `30-holidays` "safe" dates.** The spec picks March 2026 dates specifically to dodge earlier tests, but a long-lived dev DB accumulates `Attendance` rows there, so a holiday save hits the cascade-confirmation branch and the dialog legitimately stays open. `:251` now waits for the save button to relabel to `Da, obriši dolaske i spremi` and confirms if it fires. Note `:343`'s expected `2/28` depends on `:251`'s side effects — a `:251` failure always shows up as a second, misleading failure there.
- **2026-07-27 — A dead dev server looks exactly like 26 assertion failures.** phase2's first run reported failures across nearly every spec; all were `net::ERR_CONNECTION_REFUSED`. Check `curl localhost:3000` before triaging a broad phase2/phase3 failure — and prefer starting the server via `preview_start` (`inovatic-dev`) rather than relying on one another session already had running.
- **2026-07-27 — `ALL_PAGES` is the public-page smoke gate; add every new public route to it.** `/donacije` was added in the 2026-07-15 run and `/stem-edukacija` + `/natjecanja` in this one. A public page missing from `tests/phase1/shared.ts` gets no 200 / console-error / responsive / SEO / image / performance coverage at all. Check it whenever a route is added under `src/app/(public)/`.
- **2026-07-27 — A test added by a validate fix-commit must be re-run before the run closes.** The novosti city-filter locator (`05-news.spec.ts:56`) was added in `d7d29e5` (the previous run's own fix commit) and was ambiguous against the navbar's Lokacije submenu from the moment it landed — it sat red for 12 days because the suite was not re-run after that commit.
- **2026-07-27 — Hardcoded plan dates in E2E specs rot; derive them from today.** `40-sibenik-city-journey` pinned `PLAN_START_DISPLAY = '02.03.2026'`, whose 28-week arc put the 4th module's start exactly on 2026-07-27 — a standard group is public only while some module is still *about to* start, so the whole journey went red at the `/upisi` step with no tenancy bug involved. Now derived from the most recent Monday (−8 weeks for the plan, −4 for the markable session). Apply the same treatment to any new date-sensitive spec rather than adding another entry to this log.
- **2026-07-15 — Dev-DB module-schedule date rot recurs seasonally.** Public enrollment hides standard groups once every module window is past/started (`toActiveGroup` → no `nextEnrollingModule`), so spec 16's public-form tests fail after the seeded year's arc ends (last hit: `16:452`, previously `16:457` on 2026-07-09). Remedy (precedent 2026-06-11): shift `ModuleSchedule` rows for the active year+city forward until at least one module STARTS in the future — 2026-07-15 applied `+150 days` to `(2025/2026, SPLIT)` (16 rows). Check `curl 'localhost:3000/api/group-availability?city=SPLIT'` returns SLR courses before running phase2.

## Validation history

> Skill appends one line per run.

- 2026-07-31 10:16 — 296 files reviewed (delta `c207e81..HEAD`, 29 commits = everything since the previous run) on ALL 19 in-verification tasks · 5 review agents, **1 HIGH fixed**: same-campaign double-send race (claim now PENDING-conditioned `updateMany`; CUSTOM/EVALUATION had no sentKey protection and the unique index can't see a same-row re-update) + regression race test · 3 MEDIUM fixed: crash-resume unreachable (stall detection), importer duplicate-tab roster merge (fail-loud refusal), `--inspect` privacy leaks ×3 (caption-word values, Date-cell headers, unknown label heads — new `KNOWN_LABEL_HEADS` gate) · hardening: sendEmailCampaign + upsertCourseSeason transactions, upsertHolidayRange in-tx conflict count, updateGroup radionica-year guard, course-season date regex, ProgramRow → publicSignupPath, per-city contacts on /upisi/[slug], kind-aware gallery copy, croatianPlural helper (2 real plural bugs + 4 approximations) · Sonar 40→18 (22 fixed incl. 7 CC extractions; 0 open on delta app code; remainder = importer Won't-Fix cluster + pre-existing + donacije captions) · +16 tests (7u/9i: seeder idempotence ×2 files, overlap race, year guard, materials never-narrow, EVALUATION validator arm, active-module guard, inspect ×3, plan dup-tab) + 1 UTC-flake fix · unit 1027/1027 · integration 545/545 · E2E phase1 **132/132 on 2026-08-03 clean rerun** (in-run claim of 128/128 was a `| tail`-masked mis-read: actually 128 pass/4 env-fail in the dual-server era; the rerun also surfaced + fixed FieldError missing role="alert"), phase2 **149 pass + 1 cond-skip** (changed-10 104/104 + codemod-touched 15/19/20 45/45), phase3 targeted 16/16 (1 retry-confirmed goto flake logged) · E2E repairs: 11-spec login codemod (dual-role admin), spec16 ×3 (row locators, header Uredi shadow, tabs→chips), specs 15+17 termin pick, spec40 planner-count 20 + TeacherAttendance-first wipe · dev-DB: SLR-1 plan planted (`qa20260730slr1m*`) · infra: caffeinate-as-task + no-second-dev-server + chunked-playwright lessons (decisions log) · 6 outstanding items + 9 proposals + 5 diagram drafts · Flux 19/19 → done · reports/validate-2026-07-31-1016.md

- 2026-07-27 00:00 — 247 files reviewed (delta `d7d29e5..HEAD`, 50 commits = everything since the previous run) on ALL 26 in-verification tasks · 7 review agents, **4 HIGH fixed**: STEM inquiry returned `success:true` when the notification never sent (form persists nothing → inquiry destroyed silently) + 3 unindexed FKs (`TeacherAttendance.recordedById`, `EmailCampaign.sentById`/`targetCourseId`) shipped as `20260726222719_add_missing_fk_indexes` · 2 product regressions fixed: navbar overflowed **every page** at 768px after the `Prijava`→`Polaznički portal` rename (broke 14 E2E tests), and `/admin/grupe` 500'd on a group saved with `endTime <= startTime` (empty band list) · `/donacije` 6.6 MB video → `preload="none"` · 18 Sonar issues cleared (28→8 on changed files, all remaining propose-only) · +7 unit tests (780/780), integration 437/437, phase1 **106/16-fail → 132/132** (+`/stem-edukacija`, `/natjecanja` in ALL_PAGES), phase2 **146 pass / 0 fail** · 6 stale E2E specs repaired (CTA rename, mandatory `parentEmail`, mandatory-termin gate, holiday cascade branch) · phase3 best 56/57, every spec green at least once but **no fully clean full run** — residual `goto`/login timeouts, hydration budgets flagged as too tight · dev-DB: fixture group was 21/12 enrolled, blocking the tier; cleared 36 test students (user-approved) and fixed the source (bootstrap now 50 seats + fail-fast capacity error) · `40-sibenik-city-journey` had rotted on a hardcoded plan date → now derived from today · 24 outstanding items, heaviest cluster = teacher-hours payout integrity (future-date self-crediting, holiday cascade, delete cascade, live session length, co-taught backfill) + 4 diagram updates drafted · Flux 26/26 → done · reports/validate-2026-07-27-0000.md

- 2026-05-13 10:51 — 170 files reviewed (branch) · 1 auto-fix (sonar gallery Promise reject) · 0 tests added · 2 sonar fixed · FAIL (gallery test 2/2 consistent, 3 HIGH propose-only) · reports/validate-2026-05-13-1051.md
- 2026-05-14 17:07 — 213 files reviewed (branch) · 6 auto-fixes (5 sonar minors + 1 pagination test fix + 1 cloudinary poll bump) · 9 sonar fixed · phase2 164/164 ✓ · phase3 115/121 (1 cloudinary-timing test flake) · per-task Flux: 29 done, 5 stay (w2013br cognitive complexity, z4287i3 JWT staleness, yzmvnod + cgst3g3 diagram drift, yk7ms0u Cloudinary test) · reports/validate-2026-05-14-1707.md
- 2026-05-18 14:51 — 26 files reviewed (fix-delta `dd07bea..HEAD`) · 1 auto-fix (sonar S7758 String.fromCodePoint) · 1 sonar fixed (0 open after) · phase2+phase3 252/282 first pass + spec 15 isolated 52/52 = 282/282 effective (1 known cold-compile flake on /admin/upiti) · Flux: 9/9 verification tasks finalize to done (yzmvnod, w2013br, z4287i3, yk7ms0u, cgst3g3, u52xell, 7m98hdx, tddp7ap, pzk2w3m) · reports/validate-2026-05-18-1451.md
- 2026-05-21 12:35 — 71 files reviewed (branch, commit `2c8dcbf` three-tier test architecture) · 1 auto-fix (corrected misleading slim comment in 28-access-control) · 2 integration test files / 10 tests added — closes 1 HIGH gap (createTeacherComment/deleteTeacherComment server-action authz dropped in the slim) + 1 MEDIUM (getGroupAttendance roster scoping) · sonar 0 open · unit 336/336 · integration 56/56 · E2E 147 pass + 1 flake (25-attendance markSession, passed on isolated retry — cold route-compile race after slim removed UI-seed warmup) · 4 MEDIUM + 1 LOW proposed · Flux: 18/18 verification tasks → done · reports/validate-2026-05-21-1235.md
- 2026-05-23 14:51 — 73 files reviewed (branch `2c8dcbf..HEAD` 9 commits + 15 working-tree files) on 7 in-verification tasks the user had already pushed · 6 auto-fixes (1 HIGH merge regression in working-tree inquiry.ts re-applying i6oytr8 declineInquiry on top of d8ml9g0 capacity work + 1 LOW GRADE_LABELS centralization in upiti/[id] + 1 CRITICAL sonar S3776 cognitive complexity in createStudentFromInquiry via sendInquiryCredentialsEmail extraction + 2 MINOR sonar S6606/S6644 + 1 MINOR sonar S7737 + 1 HIGH e2e test regex regression from xutm2f0 caption format change) · sonar 4 open → 0 after fixes · unit 346/346 · integration 70/70 · E2E phase2/22 2/2 + phase2/15 37 pass + 1 fixed → skip-on-seed · UI verification: capacity chip (Popunjeno red + Još 2 slobodna mjesta amber), decline-reason rendered, GRADE_LABELS rendering, school-year switcher in sidebar · Flux: 7/7 verification tasks → done · 1 MEDIUM proposed (archived-year guard on student.ts enrollment actions — xutm2f0 scope gap) + 5 LOW + 2 diagram updates + 8 test gaps · reports/validate-2026-05-23-1451.md
- 2026-05-24 20:55 — 32 files reviewed (branch `origin/main..HEAD` 9 commits) on 7 in-verification tasks · 2 auto-fixes (Object.freeze ARCHIVED_ERROR in school-year-guard.ts + 5-line single-retry policy comment on runWithGroupCapacityGuard) · 2 e2e test bug fixes (spec 22 radionica seed missing schoolYear after 1dad61b cookie scoping; spec 16 decline-inquiry test missing reason fill after 736f2ea — Zod requires min 3 trimmed) · 3 new unit test files / 13 tests added (`school-year-guard.test.ts` 5, `group-capacity-chip.test.tsx` 5, +3 to `inquiry.test.ts` for workshop-sentinel rejection) · sonar 0 open · unit 363/363 · integration 78/78 · E2E phase2/22 2/2 + phase2/15 38 pass + 1 skip + phase2/16 43/43 (1 flake at L691 edit-group cold compile after auto-fix HMR — passed clean on retry) · Flux: 7/7 verification tasks → done · 1 HIGH + 2 MEDIUM + 9 LOW proposed (email-failure orphan in createStudentFromInquiry/createStudentManually, string-matching control flow in catch, status:notIn fragility, getInquiry dead-data fetch, public submitInquiry archived guard, partial FK indexing, moduleScheduleIds cross-course leak, a11y aria-live × 3) + 2 diagram updates (sequence-diagram.md declineInquiry rename + flowchart.md capacity-guard pattern) + 6 test-coverage gaps · reports/validate-2026-05-24-2038.md
- 2026-06-26 12:17 — 21 files reviewed (branch `origin/main..HEAD` 4 commits = the impl of 2026-06-11's propose-only items) · 2 auto-fixes (2× Sonar S3358 nested-ternary: group-materials-view.ts featuredRobocamp + enrollment-payment-panel.tsx icon) · sonar S3776 9→0 (the whole point of the diff), project open 8→6 · 5 new integration tests / 2 files (admin-students-year-filter.test.ts 4 + getInquiryCourses radionica year-scope +1) closing the only 2 uncovered new behaviors (getStudents schoolYear filter, getInquiryCourses) · unit 545/545 · integration 180/180 · E2E skipped (no working-tree change affects browser; only UI delta is behavior-identical ternary extraction) · 0 HIGH · 4 propose-only: 2× S2301 material.ts (Won't-Fix — splitting re-raises CC), S6848 holiday-calendar onMouseLeave container (Won't-Fix), format.ts local-vs-UTC getters (LOW latent), select aria-labels (LOW a11y) · Flux: 4/4 in-scope verification tasks → done (eccignn, snke7i5, 72zqzu9, 1c15g6o). THEN (user-requested) validated + finalized the other 6 Verification tasks (already merged to origin/main): bwv9tng + qe4wj30 (unit/int/lint only — green), sft2oc8 (E2E 33-payments 5/5), atn0c8s (E2E 32 + 24-main), ljrx4wc (E2E 24:68 + int), f56nzlo (int public-enrollment-window) → all done = 10/10 Verification cleared. E2E incidents: foreign next-server v16.2.1 squatting on :3000 (freed, user-approved — restart their other dev server); macOS revoked ~/Documents access mid-run (getcwd EPERM → restart Claude Code to recover; see reference/macos-tcc-revocation-midsession.md). Test-only fixes: merged-tab dual-render `.first()` in phase3.ts + 24-materials.spec.ts. Residual E2E test-debt flagged as follow-up task (16:266 stale /admin/programi card locator, 24:561 radionica seed, 22:55 group-seed). · reports/validate-2026-06-26-1217.md
- 2026-06-11 00:40 — 114 files reviewed (delta `534bb02..HEAD` 23 commits + working tree) on 26 in-verification tasks · 40 auto-fixes (38 sonar mechanical across 10 files incl. S4144 makeDraftHandlers extraction + aria-label on attendance note input + AbortSignal.timeout on holiday-api) · sonar 47→9 open (9 S3776 propose-only) · 5 e2e test bugs fixed (spec 32 Sunday-start range vs computeWorkshopLabels Sunday-skip; spec 18 dropped-credentials-modal helper, SHIFT_DATES date rot → dynamic, historization rerun-idempotency; spec 16 radionica dateStart+dateEnd ×2, Radionice-tab clicks, tr-scoped asserts vs weekly-grid lane-packing) · 3 new test files / 19 tests (copy-button 4u, student-year-sections 7u, admin-student-email-contract 4i) · unit 475/475 · integration 139/139 · E2E spec16 43/43 + spec18 10/10 + spec30 6/6 + spec32 2/2 + full phase2+3 confirmation run · dev-DB maintenance: 2× garbage-group cleanup + 2025/2026 module-window re-stagger (date rot — recurs after 2026-08-16) · HIGH migration backfill waved off by user (dummy prod data — see decisions log) · 1 MEDIUM (bulkImportHolidays TOCTOU) + 7 LOW + 9 S3776 + 3 diagram updates proposed · epic cross-check: getActivePrograms gap = existing task ql3p3ps · reports/validate-2026-06-11-0040.md
- 2026-07-15 14:00 — 229 files reviewed (delta `341e9f4..HEAD`, 17 pushed commits) on ALL 12 in-verification tasks (city tenancy PR1–PR9 + lokacije aip6zb7 + assessments s0v1isr + donacije lc4ej65) · 5 review agents, 0 HIGH · 5 bugs fixed: 2× seed cleanup missing studentAssessment (RESTRICT FK re-run breaker), deleteGroup missing assessment gate, deleteStudent hard-delete not role-constrained (Slavica blast radius — now notFound like cross-city), admin upsertAssessment missing enrollment membership (teacher path had it) · 2 stale E2E specs rewritten (26+27 still drove removed MODULE_REVIEW UI — would have failed; now drive the report card) · Sonar changed-files 35→0 (28× S6582 optional-chain on the city guards, 2× S3776 extractions, S6819 fieldset+legend, S3358/S6772/S7781 + self-introduced S7735), project 40→6 (all pre-existing Won't-Fix/unchanged) · +3 unit (skill-level-control) 602/602 · +3 integration cases (deleteStudent role, admin/teacher assessment negatives) 356/356 · +7 E2E additions (donacije 200/console/SEO/responsive via ALL_PAGES, /kontakt 308, /lokacije/zagreb 404, sitemap URLs, novosti ?grad) · E2E phase1 99 ✓ phase2 117+43 re-run ✓ (16:452 = dev-DB date rot, +150d ModuleSchedule re-stagger, see decisions) phase3 57 ✓ (incl. rewritten 26/27 + 40-sibenik) · :3000 squatter (villamandalina) killed user-approved · next.config WP remotePattern path-scoped · 4 propose (venue-data SoT, two-city titles, FK indexes, PR1/PR2 deploy retrospective) + erd.md draft + CLAUDE.md/validate.md MODULE_REVIEW doc drift · Flux 12/12 → done · reports/validate-2026-07-15-1344.md
- 2026-07-09 19:50 — full delta since last run (branch `origin/main..HEAD` 8 commits, 112 files + working tree 14 files) on ALL 17 in-verification tasks (arch-simplification epic P2–P15 + party 9rjfdn4 + createGroup g589zgp + E2E-locators h8zk88v) · 5 parallel review agents: 0 HIGH, 1 MEDIUM regression FIXED (P6 pinned group startTime/endTime to `^\d{2}:\d{2}$` but the create/edit forms use free-text inputs → single-digit "9:00" was blocked; relaxed to `^\d{1,2}:\d{2}$`) · LOW fixes: P11 first-Zod-issue surfaced English defaults on un-messaged payment/module/enrollment-window validators → added Croatian; P15 seed `[slr1..slr4]` destructure → `seededCourses.map`; package.json radix-ui re-indent · Sonar 17 on changed files → 15 auto-fixed (S3863 dup-imports ×6, S3358/S4624 ternary+nested-template, S7781 replaceAll, S7764 globalThis), 2 Won't-Fix (S6848 calendar grid, S7735 canEdit!==false); project 20→6 · 3 new integration tests / 8 cases closing P3 (deleteCourse guard + deleteStudent atomic detach/rollback) + P4 (student-detail payload scope: passwordHash absent, plainPassword kept, payment admin-only) · unit 563/563 · integration 203/203 · E2E h8zk88v: stale phase3 fixture re-bootstrapped → phase3/22 4/4 + phase3/24 + 16:266 green; lone 16:457 fail = dev-data (no enrollable SLR1 group in dev DB), not a regression; user's own :3000 dev server causes login-hydration flakes · browser /proslave party form OK · KEY FINDING: committed HEAD did NOT compile standalone — student.ts (P4/P8) imports PaginatedResult from @/lib/action-types but the export was only in the uncommitted P11 change; resolved by committing the working tree · Flux 17/17 → done · reports/validate-2026-07-09-1950.md
