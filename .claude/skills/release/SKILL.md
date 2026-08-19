---
name: release
description: This skill should be used when the user invokes `/release`, or asks to cut a release, declare a new version, or write release notes for the admins before pushing. Reads the last version from src/lib/releases.ts, gathers what changed since it, drafts plain-Croatian user-facing notes WITH the user, then writes the changelog entry, bumps package.json, tags, and commits — without pushing. On the next push, production mails the notes to every admin exactly once.
allowed-tools: Bash, Read, Edit, Write, AskUserQuestion, TodoWrite, mcp__flux__find_tasks, mcp__flux__add_task_comment
argument-hint: [patch | minor | major]
---

# /release — declare a version and write its notes

Cutting a release is a deliberate act: it adds one entry to `src/lib/releases.ts`,
and the next production start mails that entry to every ADMIN, once
(`src/lib/release-announce.ts` claims `ReleaseAnnouncement.version` before
sending, so restarts and repeat deploys cannot duplicate it).

**Pushing without running this sends nothing.** That is the normal case and must
stay cheap — never suggest cutting a release just because there are commits.

**This skill never pushes.** It stops at a commit and a tag. The user pushes.

## Step 1 — Preflight

```bash
git rev-parse --show-toplevel && git branch --show-current && git status --short
git log --oneline origin/main..HEAD
```

Stop and ask the user how to proceed if any of these hold:
- The repo is not `inovatic`.
- The branch is not `main` (releases are cut on what is about to be pushed).
- A rebase/merge is in progress.

The working tree may legitimately be dirty — this repo is sometimes shared with a
concurrent session. Note what is dirty and carry it into step 7; **never**
`git add -A`.

## Step 2 — Find the last version

`src/lib/releases.ts` is the source of truth; its first entry is the current
version. Cross-check the other two records, which must agree:

```bash
head -5 package.json | grep version
git tag --list 'v*' --sort=-v:refname | head -3
```

If they disagree, the changelog wins — say so and repair the others in step 6.
If `RELEASES` is empty this is the first release; propose `1.0.0` (the app is
already live, so `0.x` would understate it) and say why.

## Step 3 — Gather what actually changed

```bash
git log v<last>..HEAD --no-merges --format='%h %s%n%b'   # all commits, if first release
git diff --stat v<last>..HEAD
```

Include uncommitted work — it is about to be pushed in the same batch.

Commit subjects in this repo are already written as behaviour sentences, but
they are written for the developer. Read the diff for anything whose user-facing
effect is unclear, especially: new screens or columns, changed emails, changed
rules about who sees what, and anything touching `/admin`, `/nastavnik` or
`/portal`. `docs/diagrams/` changes usually signal a rule change worth a line.

## Step 4 — Draft the notes

Write Croatian sentences for an administrator who has never seen the code.
The rules and the worked examples live in the header of `src/lib/releases.ts` —
**read that file before drafting**, and follow it.

The shape:
- `title` — one sentence naming the release. It becomes the e-mail subject, so
  it has to stand alone in an inbox list.
- `added` — capabilities that did not exist.
- `changed` — things that existed and now behave differently.
- `fixed` — things that were broken.

Test each line against: *could an admin notice this without being told?* If not,
it gets no line. Refactors, tests, dependency bumps, performance work nobody can
perceive, and internal renames are all silent. Groups may be empty, but a
release with nothing at all in any group should not be cut — say so and offer to
stop.

Merge several commits into one sentence when they are one change to a user.
Split one commit into several when it changed several unrelated things.

## Step 5 — Agree the notes and the version with the user

Present the draft in full and **wait**. This step is the point of the skill: the
user knows which changes their staff actually care about, and which wording
matches how they talk about the app. Iterate until they approve.

Then propose the bump and let them confirm — `major` for a change that forces
staff to work differently, `minor` for new capability, `patch` for fixes only.
An explicit `$1` (`patch`/`minor`/`major`) is the user's answer already; still
show the resulting version number before writing.

## Step 6 — Write the files

1. Prepend the entry to `RELEASES` in `src/lib/releases.ts` (newest first).
2. Set the same version in `package.json`.

## Step 7 — Verify

```bash
npm run lint:all
```

`tests/unit/lib/releases.test.ts` enforces the format and rejects repository
vocabulary in the notes — a failure there is a note that needs rewriting, not a
test that needs relaxing.

## Step 8 — Commit and tag

Stage **by path**, never `-A`, so a concurrent session's in-flight files stay
out of the release commit:

```bash
git add src/lib/releases.ts package.json
git commit -m "<Croatian sentence describing the release>"
git tag v<version>
```

House rules: Croatian commit subject in the same voice as the log, no AI
co-author trailer.

If the user's own feature work is still uncommitted, ask whether to commit it
first (separately, before the release commit) or leave it staged for them.

## Step 9 — Record it

Append one line to the release log in memory —
`~/.claude/projects/-Users-jpucic-Documents-GitHub-inovatic/memory/project/release-history.md`
— as `- **v<version>** (<yyyy-mm-dd>) — <title>`, newest first. The repo stays
authoritative; this is the cross-session log.

If a Flux task covers the work being released, add a comment naming the version.

## Step 10 — Hand off

Tell the user, plainly:
- the version and tag that now exist locally,
- that nothing has been pushed,
- that `git push && git push --tags` triggers the Railway deploy, and every ADMIN
  gets the e-mail once, within seconds of it going live,
- how many admins that currently is:

```bash
DATABASE_URL=... npx prisma db execute --stdin <<< 'SELECT count(*) FROM "User" WHERE role = '"'"'ADMIN'"'"' AND "deletedAt" IS NULL;'
```

Only run that against production if the user asks — otherwise just say the
recipients are every non-deleted ADMIN.

## If something goes wrong after the push

- **Notes had a typo.** Fix the wording in `src/lib/releases.ts` and push again.
  Nobody is mailed twice — the receipt already exists. The corrected sentence is
  for the record, not for the readers.
- **The mail never arrived.** Check the deploy logs for `Release <version>`.
  "no admin could be mailed" means it released its claim and will retry on the
  next start. Silence means either no `RESEND_API_KEY` or the release is dated
  more than 30 days back (`ANNOUNCE_WINDOW_DAYS`).
- **A release was cut by mistake and already pushed.** The mail is out; there is
  no recall. Cut the next release with a correcting line.
