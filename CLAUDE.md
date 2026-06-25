# Inovatic Project

Website for Udruga za robotiku "Inovatic" (Robotics Association), Split, Croatia. Teaches kids ages 6-14 STEM/robotics through LEGO Spike courses (SLR 1-4).

## Tech Stack
Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Prisma + PostgreSQL (Neon) + Auth.js v5 + Cloudinary (EU) + Resend + React Email + Zod + next-intl + BlockNote (admin editor only) + Playwright + Vitest (unit + integration tiers)

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
- Auth guards: `requireAdmin()`, `requireTeacher()`, `requireStudent()`, `requireAuth()` from `src/lib/auth-guard.ts`
- Roles: ADMIN, TEACHER, STUDENT (future: PARENT)
- Inquiry status flow: NEW -> ACCOUNT_CREATED (or DECLINED at any point)
- Enrollment workflow: Public inquiry -> Admin reviews -> Creates student account + enrollment

## Phase 3 (student portal + teacher panel) conventions
- **Student portal** at `/portal` is gated by `requireStudent()`. Students with exactly ONE active enrollment land directly on that group's current-module materials (no extra click); 2+ → grid of group cards; 0 → empty state.
- **Teacher panel** at `/nastavnik` is gated by `requireTeacher()` (admins pass through for support). Group-scoped routes use `assertTeacherOwnsGroup(groupId)` from `src/lib/teacher-guard.ts` — teachers 404 on colleagues' groups.
- **Material scope model** (`MaterialScope` enum): MODULE → visible on every group of that course+module; COURSE → visible on every group of a radionica (`isCustom=true`); GROUP → visible only in that one ScheduledGroup. Per-group exceptions via `MaterialGroupHide`. No publish/draft — attached = visible. Videos support Cloudinary upload OR an embedded YouTube/Vimeo URL.
- **Attendance** is `(Enrollment, sessionDate)` — no separate `ClassSession`. Teacher marks weekly from the Dolazak tab; admin reads `getStudentAttendance(studentId)` on the student page.
- **Comments/reviews/grades** live in `StudentComment` with `type` = COMMENT or MODULE_REVIEW. **Staff-only — never rendered in `/portal/*`.** Teachers can delete only their own; admins delete anything (`canDeleteComment` in `src/lib/teacher-guard.ts`).
- **Gallery** (`GalleryImage` model, added 2026-05-07): per-group image bucket, scoped by `(scheduledGroupId, moduleId?)`. Standard programs require `moduleId`; radionice (`Course.isCustom = true`) require `moduleId IS NULL`. Validation lives in the server action (`src/actions/gallery/crud.ts`), not in a DB CHECK. Teacher `Galerija` tab on `/nastavnik/grupa/[id]`, student read-only view at `/portal/grupa/[id]/galerija`, admin `<GroupGalleryPanel>` on `/admin/grupe/[id]`. Upload route `/api/upload/gallery`: image-only (jpeg/png/webp/gif), **10 MB cap to match Cloudinary free-plan image limit**, ADMIN+TEACHER. `publicId` stored on the row; cleanup via `destroyCloudinaryAssetsByPublicId` in `src/lib/cloudinary-url.ts`. Lightbox = `yet-another-react-lightbox` v3.29 + `Download` plugin (already installed for article galleries — reuse, don't reinvent).
- **Role-based login redirect**: `src/actions/login.ts` routes ADMIN → `/admin`, TEACHER → `/nastavnik`, STUDENT → `/portal`.

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
npx playwright test tests/     # Playwright E2E tier (requires dev server on port 3000)
```

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
