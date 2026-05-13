# Inovatic Project

Website for Udruga za robotiku "Inovatic" (Robotics Association), Split, Croatia. Teaches kids ages 6-14 STEM/robotics through LEGO Spike courses (SLR 1-4).

## Tech Stack
Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Prisma + PostgreSQL (Neon) + Auth.js v5 + Cloudinary (EU) + Resend + React Email + Zod + next-intl + BlockNote (admin editor only) + Playwright

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
npm run lint:all               # ESLint + TypeScript + knip (dead code)
npx tsc --noEmit               # Type check only
npx playwright test tests/     # Run Playwright tests (requires dev server on port 3000)
```

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

You are an autonomous agent using Flux for task management. Board: <http://localhost:4242>.

**Active project**: `inovatic` — `project_id: stk17lx`. Fixed for this repo.
**Agent name**: `claude-inovatic-jpucic` — pass as `agent_name` on every Flux mutation so the board attributes work consistently.

RULES:
- All work MUST belong to project_id `stk17lx`.
- You MUST NOT guess or invent a project_id.
- You MUST NOT switch to a different project without explicit instruction.

LIFECYCLE — follow exactly:

0. **PLAN MODE** (when Claude Code is in plan mode):
   - Plan mode forbids **mutations**. Read-only Flux MCP calls (`list_tasks`, `list_projects`, `list_epics`) ARE allowed and ARE expected — see step 1a.
   - Draft the plan to the designated plan file as normal.
   - Note the plan's title and any "Verification" section bullets — you'll feed them into Flux in step 1.

1a. **NAMED-TASK LOOKUP — MANDATORY FIRST STEP whenever the user names a task in their prompt.**
   - Trigger phrases include "start implementing task 'X'", "start planning task 'X'", "continue the X task", "work on X", or any prompt that quotes/names a specific task title.
   - Before drafting a plan, before any `create_task`, before any state transition:
     1. `mcp__flux__list_tasks({ project_id: "stk17lx" })` — read-only, allowed inside plan mode.
     2. Find a task whose `title` matches what the user said (case-insensitive; prefer exact; accept an unambiguous near-match such as substring or word-set match).
     3. Branch:
        - **Exactly one match** → bind that `task_id`. Remember it for step 1. Do NOT create a new task.
        - **Multiple plausible matches** → `AskUserQuestion` to disambiguate. Never guess.
        - **No match** → `AskUserQuestion`: "(a) Create new task titled 'X', (b) pick an existing task, (c) skip Flux tracking." Never silently create a duplicate.
   - Never call `create_task` with a title the user just spoke without first confirming no existing task has that title.

1. **POST-PLAN-APPROVAL OR SESSION START** (immediately after `ExitPlanMode` succeeds, or at the start of any direct-implementation session):
   - **If step 1a bound an existing `task_id`**: call `mcp__flux__update_task({ task_id, acceptance_criteria: [<bullets from the plan's Verification section>], agent_name: "claude-inovatic-jpucic" })` to refresh the criteria from the latest plan. **DO NOT call `create_task`.** If status is `planning`, also promote to `todo`.
   - **If step 1a found no match and the user confirmed creation** (post-plan-mode flow): create the task from the approved plan file:
     ```
     mcp__flux__create_task({
       project_id: "stk17lx",
       title: "<short plan title — first H1 or one-line intent>",
       acceptance_criteria: [<bullets from the plan's Verification section>],
       agent_name: "claude-inovatic-jpucic"
     })
     ```
     The task lands in `planning` (Flux's default). Promote it: `mcp__flux__update_task({ task_id, status: "todo", agent_name: "claude-inovatic-jpucic" })`.
   - **If no plan mode and no named task** (user asks you to implement something directly without naming a task): list tasks first — `mcp__flux__list_tasks({ project_id: "stk17lx" })`. If a relevant `todo`/`planning` task exists, use it. If not, ASK the user: *"No matching Flux task. Create one and proceed, or proceed without Flux tracking?"* If they say create, use the same `create_task` shape above with a title from their request.
   - Move the active task to in_progress: `mcp__flux__update_task({ task_id, status: "in_progress", agent_name: "claude-inovatic-jpucic" })`.

2. **During implementation**: log meaningful progress as `mcp__flux__add_task_comment` — never rely on session memory across compactions.

3. **When implementation + your own initial verification pass** (lint, type-check, unit tests you wrote, smoke tests — the checks you'd normally run before declaring "done"):
   - `mcp__flux__move_task_status({ task_id, status: "verification", agent_name: "claude-inovatic-jpucic" })`.
   - The task moves to the **Verification** column on the board.
   - Tell the user: "Task ready for `/validate`." Stop there.

4. **DO NOT move tasks to `done` yourself.** The user's `/validate` skill owns that transition — it compares unpushed commits against verification-marked tasks and finalizes them on a passing QA run.

CONTEXT LOSS:
- If unsure of task_id, STOP. Re-list tasks. Ask the user if ambiguity remains.

INFRASTRUCTURE:
- Flux MCP requires the `flux-web` Docker container running. If MCP calls fail: `docker ps --filter name=flux-web`; `docker start flux-web` if stopped.

FORBIDDEN:
- Working without project_id `stk17lx`.
- Mixing tasks across projects.
- Moving tasks to `done` outside `/validate`.
- Relying on memory outside Flux.
