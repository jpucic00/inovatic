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
- Auth guards: `requireAdmin()`, `requireTeacher()`, `requireAuth()` from `src/lib/auth-guard.ts`
- Roles: ADMIN, TEACHER, STUDENT (future: PARENT)
- Inquiry status flow: NEW -> ACCOUNT_CREATED (or DECLINED at any point)
- Enrollment workflow: Public inquiry -> Admin reviews -> Creates student account + enrollment

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
