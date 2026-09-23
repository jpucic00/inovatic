# E2E suite on GitHub Actions

`.github/workflows/e2e.yml` runs the Playwright tier on a GitHub-hosted runner so a
diagnosis loop (re-running a failing spec over and over) does not have to heat up a
laptop. Each run builds the same world local E2E assumes, from scratch:

- Postgres 16 service container (same image, user and database name as `docker-compose.yml`)
- `npm ci` → `prisma migrate deploy` → `npm run db:seed` → `npm run db:refresh-dev-dates -- --apply`
  (the seed opens enrollment windows but plans **no** module arcs; the refresh plans the
  current year for SPLIT the same way the admin planner would, so the
  `tests/global-setup.ts` warning cannot fire)
- `next dev` on :3000, then `npx playwright test tests/phase1 tests/phase2 tests/phase3`
  with the repo's own config (`workers: 1`, 60 s timeout), plus `--trace retain-on-failure`
  so every failure leaves a downloadable trace

No `RESEND_API_KEY` is set, so every email sender no-ops. The three `CLOUDINARY_*`
values are optional repo secrets — without them `tests/phase3/24-materials.spec.ts`
skips its Cloudinary Admin API deletion assertion and everything else still runs.

## One-time setup

1. The workflow file must land on `main` — `workflow_dispatch` is only offered for
   workflows that exist on the default branch. After that it can be dispatched **on any
   ref that also contains the file** (i.e. push your WIP branch, dispatch on it).
2. `gh auth login` on the machine that will trigger runs (the default github.com HTTPS
   flow grants the needed `repo` + `workflow` scopes). Watching runs and downloading
   artifacts needs the same auth.
3. Optional, to un-skip the Cloudinary assertion:

   ```bash
   gh secret set CLOUDINARY_CLOUD_NAME
   gh secret set CLOUDINARY_API_KEY
   gh secret set CLOUDINARY_API_SECRET
   ```

## The loop

```bash
# full suite on a branch
gh workflow run e2e.yml --ref my-branch

# just the spec under diagnosis
gh workflow run e2e.yml --ref my-branch -f specs="tests/phase3/25-attendance.spec.ts"

# find the run id, follow it to completion, read only the failures
gh run list --workflow=e2e.yml -L 3
gh run watch <run-id> --exit-status
gh run view <run-id> --log-failed

# traces + dev-server log for red tests
gh run download <run-id> -n e2e-failure-artifacts -D /tmp/e2e-artifacts
npx playwright show-trace /tmp/e2e-artifacts/test-results/<test>/trace.zip
```

Dispatching again on the same branch cancels the in-flight run (`concurrency`), which is
what you want mid-diagnosis: only the newest push matters.

## Expectations and limits

- **State**: the database is created, migrated and seeded per run and discarded after —
  no carryover between runs, unlike the long-lived local dev DB. Anything a spec needs
  must come from the seed + refresh pair or from the suite's own fixtures
  (`tests/phase3/20-bootstrap.spec.ts` creates the two fixture groups through the admin
  UI; the module arcs those groups depend on come from the refresh step).
- **Duration**: setup (install, browsers, migrate, seed, dev-server boot) is roughly
  4–6 minutes; budget ~8–12 minutes for a single-spec run and expect the full serial
  suite to take on the order of an hour on the 2-core runner. Job timeout is 90 min.
- **Cost**: GitHub-hosted Linux runners are free without a minute cap on public repos;
  private repos get 2,000 free minutes/month on the Free plan (3,000 on Pro), then
  $0.008/min for Linux.
- **Next steps if wanted**: a `pull_request` trigger, one job per phase for wall-clock
  (needs a check that the phases are independent), or a sibling job for the vitest
  integration tier.
