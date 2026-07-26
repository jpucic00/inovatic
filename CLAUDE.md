# Inovatic Project

Website for Udruga za robotiku "Inovatic" (Robotics Association), Split, Croatia — operating as two separated city tenants since 2026: Split and Šibenik (Trokut inkubator). Teaches kids ages 6-14 STEM/robotics through LEGO Spike courses (SLR 1-4).

## Tech Stack
Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Prisma + PostgreSQL (Neon) + Auth.js v5 + Cloudinary (EU) + Resend + React Email + Zod + BlockNote (admin editor only) + Playwright + Vitest (unit + integration tiers)

## Project Structure
- Route groups: `(public)`, `(admin)`, `(teacher)`, `(portal)`, `(auth)`
- Server Actions in `src/actions/` (admin actions in `src/actions/admin/`)
- Zod validators in `src/lib/validators/` (admin in `src/lib/validators/admin/`)
- shadcn/ui components in `src/components/ui/`
- Emails in `emails/` (React Email templates)

## Conventions
- Server Actions for all mutations (no REST API)
- Server Components for SEO-critical public pages
- Croatian locale: date format `dd.MM.yyyy.`, currency EUR, primary language Croatian
- Auth guards: `requireAdmin()`, `requireAdminCtx()` (returns `{ session, city }`), `requireTeacher()`, `requireStudent()` from `src/lib/auth-guard.ts` (`requireAuth` is module-private and fails closed on a session without a `city` claim)
- Roles: ADMIN, TEACHER, STUDENT (future: PARENT)
- Inquiry status flow: NEW -> ACCOUNT_CREATED (or DECLINED at any point)
- Enrollment workflow: Public inquiry -> Admin reviews -> Creates student account + enrollment

## Phase 3 (student portal + teacher panel) conventions
- **Student portal** at `/portal` is gated by `requireStudent()`. Students with exactly ONE active enrollment land directly on that group's current-module materials (no extra click); 2+ → grid of group cards; 0 → empty state.
- **Teacher panel** at `/nastavnik` is gated by `requireTeacher()` (admins pass through for support). Group-scoped routes use `assertTeacherOwnsGroup(groupId)` from `src/lib/teacher-guard.ts` — teachers 404 on colleagues' groups.
- **Material scope model** (`MaterialScope` enum): MODULE → visible on every group of that course+module; COURSE → visible on every group of that course (standard and radionice); GROUP → visible only in that one ScheduledGroup. Per-group exceptions via `MaterialGroupHide`. No publish/draft — attached = visible. Videos support Cloudinary upload OR an embedded YouTube/Vimeo URL.
- **Attendance** is `(Enrollment, sessionDate)` — no separate `ClassSession`. Teacher marks weekly from the Dolazak tab; admin reads `getStudentAttendance(studentId)` on the student page.
- **Comments** are pure notes in `StudentComment` (the `type`/`moduleId` fields and MODULE_REVIEW were removed 2026-07-11). **Grades** live in `StudentAssessment`: one report card per `(studentId, groupId)` — six nullable `SkillLevel` skills, `opisnaOcjena`, and `recommendationKind` (+`recommendedCourseId` when COURSE). Standard programs only — radionice are never graded (enforced in `src/lib/student-assessment-core.ts`); the admin action additionally requires enrollment membership, the teacher action `assertStudentInGroup`. **Comments stay staff-only — never rendered in `/portal/*`. Grades are parent-visible read-only since 2026-07-25**: `/portal/grupa/[groupId]/evaluacija` renders the report card via `getMyAssessmentForGroup` (`src/actions/student/assessment.ts` — enrollment lookup is the access gate, ids resolved to labels, an all-blank row reads as "not graded yet") and `<AssessmentReadonly>`; the editable staff card and the portal card share `SKILL_LEVEL_BADGE_CLASS` so levels read the same in both. The Evaluacija pill on the portal materials screen is hidden for radionice. Teachers can delete only their own comments; admins delete anything *within their city* (`canDeleteComment` in `src/lib/teacher-guard.ts`; both delete actions resolve the comment's group city first).
- **Gallery** (`GalleryImage` model, added 2026-05-07): per-group image bucket, scoped by `(scheduledGroupId, moduleId?)`. Standard programs require `moduleId`; radionice (`Course.isCustom = true`) require `moduleId IS NULL`. Validation lives in the server action (`src/actions/gallery/crud.ts`), not in a DB CHECK. Teacher `Galerija` tab on `/nastavnik/grupa/[id]`, student read-only view at `/portal/grupa/[id]/galerija`, admin `<GroupGalleryPanel>` on `/admin/grupe/[id]`. Upload route `/api/upload/gallery`: image-only (jpeg/png/webp/gif), **10 MB cap to match Cloudinary free-plan image limit**, ADMIN+TEACHER. `publicId` stored on the row; cleanup via `destroyCloudinaryAssetsByPublicId` in `src/lib/cloudinary-cleanup.ts`. Lightbox = `yet-another-react-lightbox` v3.29 + `Download` plugin (already installed for article galleries — reuse, don't reinvent).
- **Role-based login redirect**: `src/actions/login.ts` routes ADMIN → `/admin`, TEACHER → `/nastavnik`, STUDENT → `/portal`. A **dual-role admin** (ADMIN with ≥1 `TeacherAssignment`, e.g. Slavica) instead gets a panel choice on `/prijava` (`showTeacherPanel` in the action result → Administracija / Nastavnički panel buttons in `login-form.tsx`); the teacher header shows an "Administracija" link back to `/admin` for admins, mirroring the admin sidebar's "Nastavnički panel" shortcut. The E2E `loginWithEmail` helper auto-picks Administracija when the choice appears.

## City tenancy (two-city separation, added 2026-07)
- **`City` enum (`SPLIT | SIBENIK`) is the tenant boundary.** City-bearing models: `User`, `Location`, `ScheduledGroup` (denormalized from its venue — composite FK `(locationId, city) → Location(id, city)` makes drift impossible), `Inquiry`, `Article`, `CourseEnrollmentWindow`, `ModuleSchedule`, `SchoolYearHoliday`, `Course` (nullable: `null` = shared standard SLR, set = per-city radionica). Everything else derives city transitively via its group/article parent.
- **Every tenant-owned create passes `city` explicitly — there is NO `@default` on any city column.** Forgetting is a tsc/DB error, never a silent SPLIT mis-stamp. City comes from the session (`requireAdminCtx()` for reads, `adminAction` handler ctx for mutations), from the verified parent row (student ← inquiry, group ← venue), or hardcoded `SPLIT` for the party form. Never from client input.
- **Scoping is session-driven, data-level.** `session.user.city` is a JWT claim (60s DB re-check via `revalidateTokenClaims`; a legacy token without the claim refreshes immediately; a prod city flip propagates without re-login). Middleware stays role-only. Id-based mutations use `src/lib/city-guard.ts` asserts — a cross-city id is `notFound()`, indistinguishable from nonexistent. No city switcher, no super-admin; the admin sidebar shows a read-only city chip.
- **Every dropdown/filter feed is city-scoped**: locations, assignable teachers, courses (shared standard + own-city radionice via `city IS NULL OR city = adminCity`), and every group picker (upiti dialogs, add-enrollment, send-schedule). A new tenant-scoped query or feed is not done without a cross-city negative test — per-site tests live in `tests/integration/city-scoping-*.test.ts`; the residual launch-gate matrix is `tests/integration/city-isolation-matrix.test.ts`; the E2E journey is `tests/phase3/40-sibenik-city-journey.spec.ts`.
- **Slavica exception (dual role):** ONE `User` row — role `ADMIN`, city `SIBENIK` — is both the sole Šibenik admin and its only teacher. All teacher-guard/material/gallery ADMIN pass-throughs are city-bound (`group.city === session.user.city`); `getAssignableTeachers` returns same-city TEACHERs + the city's ADMIN; the "Nastavnički panel" sidebar shortcut appears only for an admin with ≥1 `TeacherAssignment`.
- **Deliberately shared — do NOT city-scope:** standard SLR courses (one canonical `/programi/[slug]` page; never duplicate per city), MODULE/COURSE materials + their downloads (shared curriculum; only GROUP-scope downloads check city), `Tag` taxonomy, `SchoolYear` registry, the elearning proxy (role-only). The public novosti list stays cross-city with per-article city badges and a `?grad=` filter.
- **Returning-student matching is GLOBAL with a masked cross-city hint:** same-city identity match → full history; cross-city → neutral "postojeći polaznik (druga lokacija)" badge only, and `createStudentFromInquiry` blocks with an escalation error (`CrossCityStudentError`) — never auto-reuse a cross-city account. **Two tiers** (`src/lib/student-match.ts`): strict = name+DOB; legacy = name+parent-email but ONLY against students whose `dateOfBirth IS NULL` (the historical-workbook imports). Legacy reuse in `findOrCreateStudent` backfills the inquiry's DOB, permanently graduating the account to the strict tier — tests in `tests/integration/returning-legacy-match.test.ts`.
- **Per-city planner/holidays/windows:** uniques `(moduleId, schoolYear, city)`, `(schoolYear, city, date)`, `(courseId, schoolYear, city)` — each city plans the shared curriculum on its own dates (Šibenik launched mid-cycle). Holiday attendance-cascade deletes are city-filtered. `getActivePrograms(city)` gates groups on the composite open-window key; `/api/group-availability` 400s without a valid `?city=`.

## Analytics (Umami, 2026-07-17)
- **Public pages only.** `<UmamiAnalytics>` mounts in `(public)/layout.tsx`, env-gated: `NEXT_PUBLIC_UMAMI_SCRIPT_URL` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (both required to render anything; unset = silent, e.g. local dev), optional `NEXT_PUBLIC_UMAMI_DOMAINS`. Dockerfile declares the ARGs — the vars must exist in Railway for builds to inline them.
- The tracker script **survives SPA navigation out of the public layout**, so an inline `data-before-send` guard drops internal sections (`/admin`, `/nastavnik`, `/portal`, `/prijava`, `/api`) — pattern lives in `UMAMI_INTERNAL_PATH_PATTERN` (`src/lib/umami.ts`); add any new internal route prefix there. Requires Umami ≥ 2.18.
- Conversion events fire on success branches only, via `trackUmamiEvent`: `course-inquiry` `{city}`, `party-inquiry` `{city}`; footer contact links use `data-umami-event` (`contact-email`/`contact-phone`). Never put personal data in event payloads.

## Email (transactional — Resend + React Email)
- **Service at `src/lib/email/`** — server actions import typed senders from `@/lib/email` and never touch Resend directly. `client.ts` holds the Resend client + `sendTransactionalEmail` (the `RESEND_API_KEY` no-op gate + the `EMAIL_FROM`/reply-to identity); `senders.ts`/`index.ts` expose one sender per email, each owning its subject: `sendInquiryConfirmationEmail`, `sendPartyInquiryConfirmationEmail`, `sendScheduleOptionsEmail`, `sendStudentCredentialsEmail`, `sendTeacherCredentialsEmail` (`variant: 'new' | 'reset'`), `sendBulkMessageEmail` (admin-authored subject — the one deliberate exception to sender-owns-subject; paired with `renderBulkMessageHtml` for the composer preview, same element builder so preview ≡ sent email).
- **Admin bulk email (`/admin/email`, 2026-07-24)**: two-step wizard, kinds `CUSTOM` (free text in the standard layout, repeatable) and `REENROLLMENT` (invitation with this-year target-program schedule boxes + `/upisi` CTA; idempotent — one invite per parent per `(city, targetCourseId, targetSchoolYear)` via `EmailCampaignRecipient` SENT rows, source year deliberately NOT in the key). Cohort = source year + ONE of two selection modes (validator-enforced): **by groups** (multi-select grouped by program; REENROLLMENT standard-only, re-enforced server-side) or **by preporuka** (`recommendations` — encoded `encodeRecommendation` values from the full report-card dropdown set (`getRecommendationOptions`: each SLR course + both competition tracks); every student of the year whose `StudentAssessment` matches one, group- and program-independent; campaign audit stores display labels in `sourceRecommendations`). The invitation recipient list badges each child's source-year preporuka (labels via `formatRecommendationLabel` in `src/lib/assessment-rubric.ts`; preporuka mode badges both kinds); recipients dedupe by normalized `User.parentEmail` (`src/lib/bulk-email-recipients.ts` handles the legacy `"Name <a@b>"` import residue; never mail `User.email` — always synthetic). Client submits **filters + `excludedParentEmails` only** — the server re-resolves and can only shrink the audience. Sequential loop throttled 600 ms when `RESEND_API_KEY` set (Resend 2 req/s); non-throw counts as sent; `EmailCampaign`+recipient rows power the history table. Actions in `src/actions/admin/email-campaign.ts`, validators `src/lib/validators/admin/email-campaign.ts`, template `emails/bulk-message.tsx`, tests `tests/integration/email-campaigns.test.ts`.
- **STEM education inquiry (`/stem-edukacija`, 2026-07-25)**: B2B form for schools/institutions (mentor training, equipment consulting, curriculum work), teased by `<StemEducationSection>` on the homepage between the competitions band and Lokacije. **Deliberately persists nothing** — no `Inquiry` row, nothing in `/admin`: the notification email to `ASSOCIATION_EMAIL` (reply-to = the submitter) IS the record, so its failure is the one surfaced to the visitor while the courtesy confirmation is swallowed-and-logged. Action `src/actions/stem-education.ts`, validator `src/lib/validators/stem-education.ts` (its label maps are the single source of truth for both form UI and email body), templates `emails/stem-education-{inquiry,confirmation}.tsx`. Legacy WP slugs `stem-edukacija-za-{mentore,ucitelje}` 308 here.
- **`EMAIL_FROM` is read from env** (falls back to `Inovatic <noreply@udruga-inovatic.hr>`) — must be a verified Resend sender domain in prod. Reply-to defaults to `ASSOCIATION_EMAIL` (`prijave@udruga-inovatic.hr`); only inbound notifications override it. No key ⇒ senders silently no-op (local dev/tests).
- **Error policy lives at the call site, not the service** (senders never swallow): inquiry/party confirmations swallow-and-log; student/teacher credentials swallow-and-flag (`emailFailed`/`emailSent` — account is already committed, password stays readable in the UI); schedule-options surfaces a send failure to the admin.
- **Templates** in `emails/*.tsx` (`export default` + `PreviewProps`) share scaffold/footer + the **logo header** via `emails/components/email-layout.tsx`. The logo is Cloudinary-hosted (`branding/inovatic-logo`, `LOGO_URL` in the layout) — not `public/`, since email needs an absolute URL and the apex domain still serves the old WordPress site. **Preview locally: `npm run email`** (react-email dev server on :3001) — dynamic content is driven by each template's `PreviewProps`. See `emails/README.md`. Requires the `react-email` + `@react-email/ui` devDependencies.

## Common Commands
```bash
npm run dev                    # Dev server on port 3000
npm run lint:all               # ESLint + TypeScript + knip + unit tests
npx tsc --noEmit               # Type check only
npm run test:unit              # Vitest unit tier (jsdom, < 10s) — pure logic, validators, components
npm run test:unit:watch        # Vitest unit watch
npm run test:integration       # Vitest integration tier — resets inovatic_test, then runs route+DB tests
npm run test:integration:reset # Drop + recreate + migrate inovatic_test (called automatically by test:integration)
npm run test:integration:watch # Vitest integration watch (no reset — for interactive dev)
npx playwright test tests/phase1 tests/phase2 tests/phase3  # Playwright E2E tier (requires dev server on port 3000; bare tests/ would also collect the vitest tiers and abort)
npm run db:seed                # DESTRUCTIVE full dev reseed — wipes ALL tables then rebuilds (dev only)
npm run db:seed:articles       # Articles ONLY — upserts news articles+tags+gallery by slug, idempotent, NON-destructive (safe against production)
npm run db:import-history -- <workbook.xlsx> --year 2024/2025 [--apply]  # Historical Excel import, DRY-RUN without --apply — see docs/runbooks/import-history-workbook.md
```
Article content lives in `prisma/seed.ts` (`seedArticles()`, exported). `db:seed:articles` (`prisma/seed-articles.ts`) reuses it to refresh only articles without touching users/courses/enrollments — use this to publish articles to prod. `seed.ts`'s `main()` only auto-runs when invoked directly, so importing it never wipes the DB.

## Historical workbook import (2026-07)
`scripts/import-history.ts` + `src/lib/import-history/` load one school year's Excel archive (evaluation sheet + per-group contact tabs named `PON_SLR2_1830-20`) into students/groups/enrollments/paid-marks/report-cards. Groups match existing rows by parsed identity (course+day+start time — tab `1830-20` ≡ prod `18:30-20:00`); missing ones are created under the prod naming convention at Velebitska 32/SPLIT. Imported students get app-convention usernames but **unusable passwords** (no `plainPassword`) — an admin unlocks the account via `resetStudentPassword` ("Generiraj lozinku" on `/admin/ucenici/[id]`), or it self-heals when the child re-enrolls through an inquiry (`findOrCreateStudent` mints credentials on a dedupe hit); unmatched teachers get real TEACHER accounts with `@teacher.inovatic.local` placeholder emails. `PLAĆENO` → `Enrollment.fullYearPaidAt`. Idempotent; errors in the report mean skipped rows, never partial writes of that row. Workbook columns GODINE/RAZRED/ISKUSTVO/OGLEDNA/UGOVOR/PLAĆANJE/POPUST/PONUDA/RAČUN are deliberately dropped. 2024/2025 workbook has a different layout — parser needs a pass before importing it.

## Testing — three tiers
Tests are split across three tiers by what they actually need to run; each newer tier is slower and exercises more of the stack.

- **Tier 1 — Unit** (`vitest`, jsdom env, `tests/unit/`): pure logic, Zod validators, component behavior. Lives under `tests/unit/{lib,validators,proxy,components}/`. No DB, no HTTP, no browser. Sub-10s feedback.
- **Tier 2 — Integration** (`vitest`, node env, `tests/integration/`): route handlers + Prisma against the dedicated `inovatic_test` Postgres DB. `auth()` from `@/lib/auth` is mocked via `tests/integration/setup.ts`; call `mockSession({ id, role, … })` in a test to inject a logged-in role. Direct-Prisma factories live in `tests/integration/helpers/factory.ts` (createTeacher/Student/Admin/Group/Module/ModuleSchedule/Enrollment/TeacherAssignment/Material/Location). `npm run test:integration` runs `scripts/reset-test-db.sh` first — every full run starts from an empty, fully-migrated baseline so stale state from past tests can never leak. Tests run serially (`fileParallelism: false`).
- **Tier 3 — E2E** (`@playwright/test`, `tests/phase{1,2,3}/`): real browser, real dev server, real DB. Keeps multi-step UI flows, hydration races, SEO/OG checks.

When adding tests: pure functions → unit; route handlers needing DB+auth → integration; anything that needs a browser → Playwright. `npm run lint:all` runs the unit tier as part of the pre-commit gate.

## Integration test DB
The `inovatic_test` DB lives in the same Docker `inovatic-db` container as dev `inovatic`. The reset script (`scripts/reset-test-db.sh`) drops, recreates, and `prisma migrate deploy`s it; it terminates any open connections first via `pg_terminate_backend`. To provision manually:
```bash
bash scripts/reset-test-db.sh
```
If `inovatic-db` container is not running: `docker compose up -d db`. Prisma URLs for the test DB are passed inline by the `test:integration` script — `.env` is not touched.

## Database Migrations
Prisma CLI reads `.env` not `.env.local` — must pass env vars inline for local dev:
```bash
DIRECT_URL="postgresql://inovatic:inovatic_dev_2024@localhost:5432/inovatic" \
DATABASE_URL="postgresql://inovatic:inovatic_dev_2024@localhost:5432/inovatic" \
npx prisma migrate dev --name <description>
```
- Production migrations run automatically on Railway deploy (`prisma migrate deploy` in Dockerfile CMD)
- Never use `prisma db push` in production
- Neon PostgreSQL: `DATABASE_URL` = pooled (app queries), `DIRECT_URL` = direct (migrations)

## Deployment
- **App**: Railway (auto-deploys on push to main, Dockerfile build)
- **Database**: Neon PostgreSQL (EU Frankfurt)
- **Images**: Cloudinary (cloud: dgc2tp4f8, EU)

## Important
- `preview_*` tools work — requires macOS Privacy & Security → Files and Folders → Documents Folder access granted to the terminal app. Dev server config is in `.claude/launch.json` (name: `inovatic-dev`, port 3000).
- SonarQube available locally: `npm run sonar:start`, scan with `npm run sonar:scan`

## Flux task management

**Flux stub** — the full lifecycle lives in `~/.claude/CLAUDE.md` ("Task Vocabulary"). Follow it using these values:
- **project_id**: `stk17lx`
- **agent_name**: `claude-inovatic-jpucic`
- Board: <http://localhost:4242>
